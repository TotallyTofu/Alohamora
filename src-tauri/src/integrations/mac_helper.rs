//! macOS global drag wheel: the existing Swift helper (native/mac/DragHelper.swift, shipped as a sidecar)
//! prints JSON lines: {"t":"drag"} {"t":"mods","shift":b,"alt":b} {"t":"files","paths":[…]} {"t":"up"}.
//! It exits when its stdin closes. Port of integrations/macDragHelper.ts.

use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::Mutex;

use alohamora_core::types::WheelMode;
use alohamora_engine::inspect::inspect_files;
use tauri::AppHandle;

use crate::windows::overlay;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

#[derive(serde::Deserialize)]
struct HelperEvent {
    t: String,
    #[serde(default)]
    alt: bool,
    #[serde(default)]
    paths: Vec<String>,
}

pub fn start(app: &AppHandle) {
    let mut guard = CHILD.lock().expect("helper");
    if guard.is_some() || !cfg!(target_os = "macos") {
        return;
    }
    let mut child = match alohamora_engine::process::command(&alohamora_engine::paths::mac_drag_helper())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("drag helper: {e}");
            return;
        }
    };
    let stdout = child.stdout.take().expect("piped stdout");
    *guard = Some(child);
    let app = app.clone();
    std::thread::spawn(move || {
        let (mut shown, mut alt) = (false, false);
        let mode = |alt: bool| if alt { WheelMode::Tools } else { WheelMode::Convert };
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(ev) = serde_json::from_str::<HelperEvent>(&line) else { continue };
            match ev.t.as_str() {
                "drag" => alt = false,
                "mods" => {
                    alt = ev.alt;
                    if shown {
                        overlay::drag_mode(&app, mode(alt));
                    }
                }
                "files" => {
                    let basic = if ev.paths.is_empty() { None } else { Some(inspect_files(&ev.paths, false)) };
                    shown = true;
                    let cursor = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
                    let has_files = basic.as_ref().map(|b| !b.is_empty()).unwrap_or(false);
                    overlay::drag_start(&app, mode(alt), cursor, basic); // None → "Drop to choose"
                    if has_files {
                        overlay::drag_files(&app, mode(alt), inspect_files(&ev.paths, true)); // then thumbnails
                    }
                }
                "up" if shown => {
                    shown = false;
                    overlay::drag_end(&app);
                }
                _ => {}
            }
        }
        log::warn!("drag helper exited");
        *CHILD.lock().expect("helper") = None;
    });
    log::info!("macOS drag helper started");
}

pub fn stop() {
    if let Some(mut c) = CHILD.lock().expect("helper").take() {
        drop(c.stdin.take()); // the helper exits when stdin closes
        let _ = c.kill();
        let _ = c.wait();
    }
}
