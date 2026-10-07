//! Port of src/main/engines/ffmpeg.ts: run FFmpeg with progress, capture output, probe files.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use alohamora_core::ffmpeg_parse::{friendly_ffmpeg_error, parse_probe_json, ProbeResult};

use crate::cancel::CancelToken;
use crate::paths;
use crate::process::{command, keep_tail, last_lines, run_process};
use crate::{AppError, Result};

/// Options for `run_ffmpeg`. `duration_sec` is the expected OUTPUT duration, used for progress.
#[derive(Default)]
pub struct FfmpegRun<'a> {
    pub duration_sec: Option<f64>,
    pub cancel: Option<&'a CancelToken>,
    pub on_progress: Option<&'a dyn Fn(f64)>,
}

/// Runs ffmpeg with progress reporting. `args` must NOT include -y/-progress (added here).
pub fn run_ffmpeg(args: &[String], opts: FfmpegRun) -> Result<()> {
    if let Some(c) = opts.cancel {
        c.check()?;
    }
    let mut full: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    full.extend_from_slice(args);
    let exe = paths::ffmpeg();
    let mut child = command(&exe)
        .args(&full)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::tool("FFmpeg could not be started", format!("{}: {e}", exe.display())))?;
    let stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let (tx, rx) = mpsc::channel::<String>();
    let out_thread = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    let err_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        keep_tail(&String::from_utf8_lossy(&buf), 12_000)
    });

    let handle_line = |line: &str| {
        let Some((k, v)) = line.split_once('=') else { return };
        if let (Some(cb), Some(d)) = (opts.on_progress, opts.duration_sec) {
            if (k == "out_time_us" || k == "out_time_ms") && d > 0.0 {
                // both keys are microseconds in FFmpeg
                if let Ok(us) = v.trim().parse::<f64>() {
                    if us > 0.0 {
                        cb((us / 1e6 / d).min(0.999));
                    }
                }
            }
        }
        if k == "progress" && v.trim() == "end" {
            if let Some(cb) = opts.on_progress {
                cb(1.0);
            }
        }
    };

    let status = loop {
        while let Ok(line) = rx.recv_timeout(Duration::from_millis(30)) {
            handle_line(&line);
        }
        if opts.cancel.is_some_and(|c| c.is_cancelled()) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(AppError::Canceled);
        }
        match child.try_wait() {
            Ok(Some(s)) => break Ok(s),
            Ok(None) => {}
            Err(e) => break Err(AppError::Io(e)),
        }
    };
    let _ = out_thread.join();
    while let Ok(line) = rx.try_recv() {
        handle_line(&line);
    }
    let stderr_text = err_thread.join().unwrap_or_default();
    let status = status?;
    if opts.cancel.is_some_and(|c| c.is_cancelled()) {
        return Err(AppError::Canceled);
    }
    if status.success() {
        return Ok(());
    }
    let tail = last_lines(&stderr_text, 15);
    Err(AppError::tool(friendly_ffmpeg_error(&stderr_text), format!("ffmpeg {}\n\n{tail}", full.join(" "))))
}

fn with_quiet(args: &[String], level: &str) -> Vec<String> {
    let mut a: Vec<String> = vec!["-hide_banner".into(), "-nostdin".into(), "-loglevel".into(), level.into()];
    a.extend_from_slice(args);
    a
}

/// Run ffmpeg and return stdout (use with `-f image2pipe … pipe:1`).
pub fn run_ffmpeg_to_buffer(args: &[String], cancel: Option<&CancelToken>) -> Result<Vec<u8>> {
    Ok(run_process(&paths::ffmpeg(), &with_quiet(args, "error"), cancel, "FFmpeg")?.stdout)
}

/// Run ffmpeg at loglevel info and return stderr (for loudnorm analysis).
pub fn run_ffmpeg_capture(args: &[String], cancel: Option<&CancelToken>) -> Result<String> {
    Ok(run_process(&paths::ffmpeg(), &with_quiet(args, "info"), cancel, "FFmpeg")?.stderr)
}

fn probe_cache() -> &'static Mutex<HashMap<String, ProbeResult>> {
    static CACHE: OnceLock<Mutex<HashMap<String, ProbeResult>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// "path|size|mtime" — changes whenever the file changes.
pub fn file_key(p: &Path) -> Result<String> {
    let m = std::fs::metadata(p)?;
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    Ok(format!("{}|{}|{}", p.display(), m.len(), mtime))
}

/// ffprobe the file (cached by path, size and modification time; at most 300 entries).
pub fn probe(file: &Path) -> Result<ProbeResult> {
    let key = file_key(file)?;
    if let Some(hit) = probe_cache().lock().expect("probe cache").get(&key) {
        return Ok(hit.clone());
    }
    let args: Vec<String> = vec!["-v".into(), "error".into(), "-print_format".into(), "json".into(), "-show_format".into(), "-show_streams".into(), paths::p2s(file)];
    let out = run_process(&paths::ffprobe(), &args, None, "FFprobe").map_err(|e| match e {
        // "not really the format its name says" instead of "FFprobe failed (exit code 1)"
        AppError::Tool { details, .. } => AppError::tool(friendly_ffmpeg_error(&details), details),
        other => other,
    })?;
    let result = parse_probe_json(&String::from_utf8_lossy(&out.stdout)).map_err(|e| AppError::other(format!("ffprobe JSON: {e}")))?;
    let mut cache = probe_cache().lock().expect("probe cache");
    if cache.len() > 300 {
        cache.clear();
    }
    cache.insert(key, result.clone());
    Ok(result)
}
