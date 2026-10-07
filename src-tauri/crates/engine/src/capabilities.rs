//! Port of src/main/capabilities.ts: what this computer can do (FFmpeg encoders, HEIC output, OCR data…).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::ffmpeg_parse::parse_encoder_list;
use alohamora_core::types::Capabilities;

use crate::paths;
use crate::process::run_process;

static CAPS: OnceLock<Mutex<Capabilities>> = OnceLock::new();
static HEIC_TOOL_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn platform() -> &'static str {
    if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" }
}

pub fn arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" }
}

fn empty() -> Capabilities {
    Capabilities {
        platform: platform().into(),
        arch: arch().into(),
        app_version: paths::get().app_version.clone(),
        ffmpeg: false,
        ffmpeg_version: String::new(),
        encoders: vec![],
        heif_enc: false,
        heic_tool: None,
        hw_video: None,
        global_drag: "unavailable".into(),
        ocr_languages: vec![],
    }
}

fn caps_lock() -> &'static Mutex<Capabilities> {
    CAPS.get_or_init(|| Mutex::new(empty()))
}

/// Where the HEIC encoder lives: ("sips" | "heif-enc", path).
pub fn heic_tool() -> Option<(String, PathBuf)> {
    let kind = get().heic_tool?;
    let path = HEIC_TOOL_PATH.get()?.lock().ok()?.clone()?;
    Some((kind, path))
}

/// heif-enc can be installed without any HEVC encoder plugin (Linux packages split them out).
/// Only count it when `--list-encoders` shows at least one HEIC encoder.
pub fn heif_enc_has_hevc(list_output: &str) -> bool {
    let mut in_heic = false;
    for line in list_output.lines() {
        if line.trim_end().ends_with("encoders:") {
            in_heic = line.trim_start().starts_with("HEIC");
        } else if in_heic && line.trim_start().starts_with('-') {
            return true;
        }
    }
    false
}

fn heif_enc_usable(p: &Path) -> bool {
    match run_process(p, &["--list-encoders".into()], None, "heif-enc") {
        Ok(out) => heif_enc_has_hevc(&String::from_utf8_lossy(&out.stdout)),
        Err(_) => false,
    }
}

fn detect_heic(next: &mut Capabilities) {
    let mut found: Option<(&str, PathBuf)> = None;
    if cfg!(target_os = "macos") && PathBuf::from("/usr/bin/sips").exists() {
        found = Some(("sips", PathBuf::from("/usr/bin/sips")));
    } else if let Some(p) = paths::heif_enc_candidates().into_iter().find(|p| p.exists() && heif_enc_usable(p)) {
        found = Some(("heif-enc", p));
    } else if cfg!(target_os = "linux") {
        if let Some(p) = paths::find_on_path("heif-enc").filter(|p| heif_enc_usable(p)) {
            found = Some(("heif-enc", p));
        }
    }
    next.heic_tool = found.as_ref().map(|(k, _)| k.to_string());
    next.heif_enc = found.is_some();
    *HEIC_TOOL_PATH.get_or_init(|| Mutex::new(None)).lock().expect("heic path") = found.map(|(_, p)| p);
}

fn detect_global_drag() -> &'static str {
    if cfg!(target_os = "macos") {
        return if paths::mac_drag_helper().exists() { "mac-helper" } else { "unavailable" };
    }
    if cfg!(target_os = "linux") {
        let wayland = std::env::var("XDG_SESSION_TYPE").map(|v| v == "wayland").unwrap_or(false) || std::env::var_os("WAYLAND_DISPLAY").is_some();
        return if wayland { "unavailable" } else { "hook" }; // global input is impossible on Wayland
    }
    "hook"
}

/// Detect everything (runs ffmpeg twice). Keeps an already-detected hardware encoder.
pub fn detect() -> Capabilities {
    let mut next = empty();
    let ffmpeg = paths::ffmpeg();
    match run_process(&ffmpeg, &["-hide_banner".into(), "-encoders".into()], None, "FFmpeg") {
        Ok(out) => {
            next.encoders = parse_encoder_list(&String::from_utf8_lossy(&out.stdout));
            if let Ok(v) = run_process(&ffmpeg, &["-version".into()], None, "FFmpeg") {
                next.ffmpeg_version = String::from_utf8_lossy(&v.stdout).lines().next().unwrap_or("").to_string();
            }
            next.ffmpeg = !next.encoders.is_empty();
        }
        Err(e) => log::error!("FFmpeg is not available: {e:?}"),
    }
    detect_heic(&mut next);
    next.global_drag = detect_global_drag().into();
    next.ocr_languages = paths::installed_ocr_langs();
    let mut caps = caps_lock().lock().expect("caps");
    next.hw_video = caps.hw_video.clone();
    *caps = next.clone();
    log::info!(
        "Capabilities {}-{} ffmpeg={} version={} encoders={} heic={:?} globalDrag={} ocr={:?}",
        next.platform, next.arch, next.ffmpeg, next.ffmpeg_version, next.encoders.len(), next.heic_tool, next.global_drag, next.ocr_languages
    );
    next
}

pub fn get() -> Capabilities {
    caps_lock().lock().expect("caps").clone()
}

pub fn set_hardware_video(encoder: Option<String>) {
    caps_lock().lock().expect("caps").hw_video = encoder;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heif_enc_list() {
        assert!(heif_enc_has_hevc("HEIC encoders:\n- x265 = x265 HEVC encoder [default]\nAVIF encoders:\n"));
        assert!(!heif_enc_has_hevc("HEIC encoders:\nAVIF encoders:\n- aom = AOM\nJPEG encoders:\n"));
    }
}
