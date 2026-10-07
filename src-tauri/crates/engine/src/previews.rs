//! Port of previews.ts: playable media for <video>/<audio>, single frames and waveforms.
//! The engine returns the FILE to serve; the app turns it into a kfile URL (protocol allow-list).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock};

use alohamora_core::js::{js_round, js_to_fixed};
use alohamora_core::registry::ext_of;
use sha1::{Digest, Sha1};

use crate::ffmpeg::{probe, run_ffmpeg, run_ffmpeg_to_buffer, FfmpegRun};
use crate::fsutil::data_url;
use crate::paths::{cache_dir, p2s};
use crate::Result;

const PLAYABLE_V: [&str; 4] = ["h264", "vp8", "vp9", "av1"];
const PLAYABLE_A: [&str; 8] = ["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_f32le"];
const PLAYABLE_EXT: [&str; 11] = ["mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "wav", "flac", "ogg", "opus"];

/// Codecs the webview can actually play. WebKit (macOS/Linux) and WebView2 differ, so the app may
/// replace this with what the renderer reported via `set_media_support` (optional, see the plan).
fn playable(codec: &str, list: &[&str]) -> bool {
    list.contains(&codec)
}

fn cache_key(p: &Path) -> Result<String> {
    let md = std::fs::metadata(p)?;
    let mtime = md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    let digest = Sha1::digest(format!("{}|{}|{}", p2s(p), md.len(), mtime).as_bytes());
    Ok(digest.iter().take(8).map(|b| format!("{b:02x}")).collect())
}

/// Set to true (and notified) when a proxy encode finishes.
type Gate = Arc<(Mutex<bool>, Condvar)>;

/// One proxy encode per output file, even when several windows ask at once.
fn inflight() -> &'static Mutex<HashMap<PathBuf, Gate>> {
    static M: OnceLock<Mutex<HashMap<PathBuf, Gate>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The file the UI should play: the original (playable as is) or a cached 480p H.264 / WAV proxy.
/// Returns (file, is_proxy).
pub fn media_source(p: &Path) -> Result<(PathBuf, bool)> {
    let pr = probe(p)?;
    let ext = ext_of(&p2s(p));
    let v_ok = pr.video.as_ref().map(|v| playable(&v.codec, &PLAYABLE_V)).unwrap_or(true);
    let a_ok = pr.audio.as_ref().map(|a| playable(&a.codec, &PLAYABLE_A)).unwrap_or(true);
    if PLAYABLE_EXT.contains(&ext.as_str()) && v_ok && a_ok {
        return Ok((p.to_path_buf(), false));
    }
    let is_video = pr.video.is_some();
    let out = cache_dir("proxies").join(format!("{}.{}", cache_key(p)?, if is_video { "mp4" } else { "wav" }));
    if out.exists() {
        return Ok((out, true));
    }
    // Either start the encode or wait for the one already running.
    let (gate, owner) = {
        let mut map = inflight().lock().expect("inflight");
        match map.get(&out) {
            Some(g) => (g.clone(), false),
            None => {
                let g = Arc::new((Mutex::new(false), Condvar::new()));
                map.insert(out.clone(), g.clone());
                (g, true)
            }
        }
    };
    if !owner {
        let (lock, cv) = &*gate;
        let mut done = lock.lock().expect("gate");
        while !*done {
            done = cv.wait(done).expect("gate");
        }
        return if out.exists() { Ok((out, true)) } else { Err(crate::AppError::user("This file could not be prepared for preview.")) };
    }
    let tmp = out.with_extension(if is_video { "part.mp4" } else { "part.wav" });
    let input = p2s(p);
    let tmp_s = p2s(&tmp);
    let args: Vec<String> = if is_video {
        ["-i", &input, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:'min(ih,480)'", "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "28", "-g", "15", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", &tmp_s]
            .iter().map(|s| s.to_string()).collect()
    } else {
        ["-i", &input, "-map", "0:a:0", "-c:a", "pcm_s16le", &tmp_s].iter().map(|s| s.to_string()).collect()
    };
    let result = run_ffmpeg(&args, FfmpegRun::default()).and_then(|_| Ok(std::fs::rename(&tmp, &out)?));
    {
        let (lock, cv) = &*gate;
        *lock.lock().expect("gate") = true;
        cv.notify_all();
        inflight().lock().expect("inflight").remove(&out);
    }
    result.map(|_| (out, true))
}

/// One video frame at `t` seconds as a JPEG data URL, at most `max_width` wide.
pub fn frame(p: &Path, t: f64, max_width: u32) -> Result<String> {
    let args: Vec<String> = vec![
        "-ss".into(), js_to_fixed(t.max(0.0), 3), "-i".into(), p2s(p), "-frames:v".into(), "1".into(),
        "-vf".into(), format!("scale='min({max_width},iw)':-2"), "-f".into(), "image2pipe".into(), "-c:v".into(), "mjpeg".into(),
        "-q:v".into(), "4".into(), "pipe:1".into(),
    ];
    Ok(data_url("image/jpeg", &run_ffmpeg_to_buffer(&args, None)?))
}

/// Grey waveform picture (PNG data URL), cached per path and size.
pub fn waveform(p: &Path, width: f64, height: f64) -> Result<String> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let key = format!("{}|{}x{}", p2s(p), width, height);
    if let Some(hit) = cache.lock().expect("wave cache").get(&key) {
        return Ok(hit.clone());
    }
    let w = (js_round(width / 2.0) * 2.0).max(64.0);
    let h = (js_round(height / 2.0) * 2.0).max(32.0);
    let args: Vec<String> = vec![
        "-i".into(), p2s(p), "-filter_complex".into(), format!("aformat=channel_layouts=mono,showwavespic=s={w}x{h}:colors=0x8A8A8A"),
        "-frames:v".into(), "1".into(), "-f".into(), "image2pipe".into(), "-c:v".into(), "png".into(), "pipe:1".into(),
    ];
    let url = data_url("image/png", &run_ffmpeg_to_buffer(&args, None)?);
    cache.lock().expect("wave cache").insert(key, url.clone());
    Ok(url)
}
