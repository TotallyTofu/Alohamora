//! Port of src/main/selftest/*: real files through every conversion and tool. `alohamora --selftest [--only=<group|prefix>]`.

pub mod assert;
pub mod cases;
pub mod fixtures;
pub mod fixtures_docs;

use std::path::{Path, PathBuf};
use std::time::Instant;

use alohamora_core::error::to_user_message;
use alohamora_core::registry::default_settings;
use alohamora_core::types::{Capabilities, JobRequest};
use regex::Regex;
use serde_json::json;

use crate::cancel::CancelToken;
use crate::jobs::execute::{run_job_now, RunJobOptions};
use crate::{capabilities, hw_video, AppError};

pub type CheckFn = Box<dyn Fn(&[String]) -> std::result::Result<(), String> + Send + Sync>;
pub type RequestFn = Box<dyn Fn(&[String]) -> JobRequest + Send + Sync>;

pub enum Expect {
    /// The job must succeed and this check must pass.
    Check(CheckFn),
    /// The job must FAIL with a user message matching this regex (case-insensitive unless the pattern says otherwise).
    Error(&'static str),
}

pub struct Case {
    /// Unique, e.g. "convert.audio.wav-mp3".
    pub name: String,
    /// "av", "image", "text", "pdf", "tools.video", … "errors".
    pub group: &'static str,
    /// Fixture names used as inputs, in order.
    pub fixtures: Vec<&'static str>,
    pub request: RequestFn,
    pub expect: Expect,
    /// Return a reason to skip.
    pub skip: Option<fn(&Capabilities) -> Option<String>>,
    /// Run this case with different capabilities (e.g. a broken hardware encoder).
    pub caps_override: Option<fn(&mut Capabilities)>,
}

fn describe(e: &AppError) -> String {
    let m = to_user_message(e);
    match m.details {
        Some(d) => {
            let tail: Vec<&str> = d.lines().filter(|l| !l.trim().is_empty()).collect();
            let tail = tail[tail.len().saturating_sub(3)..].join(" / ");
            format!("{} | {tail}", m.message)
        }
        None => m.message,
    }
}

/// Run the self-test. `root` holds fixtures/ (cached) and out/ (recreated). Returns the process exit code.
pub fn run(only: Option<&str>, root: &Path) -> i32 {
    let fx_dir = root.join("fixtures");
    let out_root = root.join("out");
    let _ = std::fs::remove_dir_all(&out_root);
    hw_video::detect_hardware_video(); // so hardware-encoder cases know what this machine can do
    let caps = capabilities::get();
    let all = cases::all();
    let selected: Vec<&Case> = all
        .iter()
        .filter(|c| match only {
            None => true,
            Some(o) => c.group == o || c.group.starts_with(&format!("{o}.")) || c.name.starts_with(o),
        })
        .collect();
    let mut results = Vec::new();
    let (mut pass, mut fail, mut skip) = (0, 0, 0);
    for c in selected {
        let t0 = Instant::now();
        if let Some(reason) = c.skip.and_then(|f| f(&caps)) {
            println!("SKIP  {}  ({reason})", c.name);
            results.push(json!({ "name": c.name, "status": "SKIP", "ms": 0, "info": reason }));
            skip += 1;
            continue;
        }
        let outcome = run_case(c, &caps, &fx_dir, &out_root);
        let ms = t0.elapsed().as_millis() as u64;
        match outcome {
            Ok(()) => {
                println!("PASS  {}  ({ms} ms)", c.name);
                results.push(json!({ "name": c.name, "status": "PASS", "ms": ms }));
                pass += 1;
            }
            Err(info) => {
                println!("FAIL  {}  — {info}", c.name);
                results.push(json!({ "name": c.name, "status": "FAIL", "ms": ms, "info": info }));
                fail += 1;
            }
        }
    }
    let summary = format!("{pass} passed, {fail} failed, {skip} skipped");
    let _ = std::fs::create_dir_all(root);
    let report = root.join("report.json");
    let _ = std::fs::write(&report, serde_json::to_string_pretty(&json!({ "summary": summary, "results": results })).unwrap_or_default());
    println!("\nSELFTEST: {summary}\nReport: {}", report.display());
    if fail > 0 || pass + skip == 0 { 1 } else { 0 }
}

fn run_case(c: &Case, caps: &Capabilities, fx_dir: &Path, out_root: &Path) -> std::result::Result<(), String> {
    let mut inputs = Vec::new();
    for f in &c.fixtures {
        inputs.push(fixtures::ensure(fx_dir, f).map_err(|e| format!("fixture {f}: {}", describe(&e)))?);
    }
    let safe: String = c.name.chars().map(|ch| if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' { ch } else { '_' }).collect();
    let out_dir: PathBuf = out_root.join(safe);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let mut settings = default_settings();
    settings.output_mode = "custom-folder".into();
    settings.custom_output_dir = Some(out_dir.to_string_lossy().to_string());
    let mut case_caps = caps.clone();
    if let Some(over) = c.caps_override {
        over(&mut case_caps);
    }
    let req = (c.request)(&inputs);
    let result = run_job_now(&req, RunJobOptions { id: None, cancel: CancelToken::new(), settings, caps: case_caps, on_progress: Box::new(|_, _| {}) });
    match (&c.expect, result) {
        (Expect::Check(check), Ok(r)) => check(&r.outputs),
        (Expect::Check(_), Err(e)) => Err(describe(&e)),
        (Expect::Error(pattern), Err(e)) => {
            let msg = to_user_message(&e).message;
            let re = Regex::new(&format!("(?i){pattern}")).expect("valid case regex");
            if re.is_match(&msg) { Ok(()) } else { Err(format!("expected error /{pattern}/, got \"{msg}\"")) }
        }
        (Expect::Error(pattern), Ok(_)) => Err(format!("expected error /{pattern}/, got success")),
    }
}
