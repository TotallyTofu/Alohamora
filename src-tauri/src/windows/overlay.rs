//! Port of windows/overlayWindow.ts: the transparent wheel window, kept loaded and hidden.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use alohamora_core::types::{DragState, FileInfo, OverlayInit, OverlaySize, WheelMode, WHEEL_STAGE_ANCHOR_X, WHEEL_STAGE_ANCHOR_Y, WHEEL_STAGE_HEIGHT, WHEEL_STAGE_WIDTH};
use alohamora_engine::{capabilities, inspect::inspect_files};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{app_state, platform};

pub const LABEL: &str = "overlay";

/// Where the wheel centre goes, in PHYSICAL screen pixels.
static ANCHOR: Mutex<(f64, f64)> = Mutex::new((0.0, 0.0));
static DROP_RECEIVED: AtomicBool = AtomicBool::new(false);
/// Bumped to cancel a pending "hide after drag end".
static HIDE_GENERATION: AtomicU64 = AtomicU64::new(0);

fn wheel_size() -> OverlaySize {
    OverlaySize { width: WHEEL_STAGE_WIDTH, height: WHEEL_STAGE_HEIGHT, anchor: "wheel".into() }
}

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Alohamora")
        .inner_size(WHEEL_STAGE_WIDTH, WHEEL_STAGE_HEIGHT)
        .visible(false)
        .focused(false)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible_on_all_workspaces(true)
        .additional_browser_args(super::WEBVIEW2_ARGS)
        .build()?;
    platform::configure_overlay(&win);
    Ok(win)
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Port of place(): wheel centre (or window centre) at the anchor, clamped to that monitor's work area.
/// Tauri reports monitors in physical pixels; the stage size is in logical pixels, so scale by the monitor.
pub fn place(app: &AppHandle, size: &OverlaySize) {
    let Some(win) = window(app) else { return };
    let (ax, ay) = *ANCHOR.lock().expect("anchor");
    let monitor = app.monitor_from_point(ax, ay).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let s = m.scale_factor();
    let wa = m.work_area();
    let (wx, wy, ww, wh) = (wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64);
    let width = (size.width * s).min(ww);
    let height = (size.height * s).min(wh);
    let (mut x, mut y) = if size.anchor == "wheel" {
        (ax - WHEEL_STAGE_ANCHOR_X * s, ay - WHEEL_STAGE_ANCHOR_Y * s)
    } else {
        (ax - (width / 2.0).round(), ay - (height / 2.0).round())
    };
    x = x.min(wx + ww - width).max(wx);
    y = y.min(wy + wh - height).max(wy);
    let _ = win.set_size(PhysicalSize::new(width.round() as u32, height.round() as u32));
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn set_anchor(p: (f64, f64)) {
    *ANCHOR.lock().expect("anchor") = p;
}

/// Show the wheel for these files. Runs on a worker thread (inspection reads the files).
pub fn open(app: &AppHandle, paths: &[String], mode: WheelMode, source: &str, at: Option<(f64, f64)>) {
    if window(app).is_none() && create(app).is_err() {
        return;
    }
    // Events sent before the overlay page listens would be lost.
    app_state::wait_ready(LABEL, Duration::from_secs(10));
    let basic = inspect_files(paths, false);
    let Some(win) = window(app) else { return };
    if basic.is_empty() {
        return;
    }
    let cursor = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
    set_anchor(at.unwrap_or(cursor));
    place(app, &wheel_size());
    let init = OverlayInit { files: basic.clone(), mode, caps: capabilities::get(), source: source.into() };
    let _ = app.emit_to(LABEL, "ev:overlay-init", init);
    let _ = win.show();
    let _ = win.set_focus();
    let deep = inspect_files(&basic.iter().map(|f| f.path.clone()).collect::<Vec<_>>(), true);
    let _ = app.emit_to(LABEL, "ev:overlay-files", deep);
}

pub fn resize(app: &AppHandle, size: &OverlaySize) {
    place(app, size);
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = window(app) {
        log::info!("overlay: hide");
        platform::hide(&w);
    }
}

pub fn is_visible(app: &AppHandle) -> bool {
    window(app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Global drag started (Shift held while dragging files). `files` is known on macOS (helper) and after `Enter`.
pub fn drag_start(app: &AppHandle, mode: WheelMode, at: (f64, f64), files: Option<Vec<FileInfo>>) {
    let Some(win) = window(app) else { return };
    log::info!("overlay: global drag started at ({:.0}, {:.0}), files known: {}", at.0, at.1, files.is_some());
    DROP_RECEIVED.store(false, Ordering::SeqCst);
    HIDE_GENERATION.fetch_add(1, Ordering::SeqCst);
    set_anchor(at);
    place(app, &wheel_size());
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files });
    platform::show_without_focus(&win); // do not steal focus from Explorer/Finder mid-drag
}

pub fn drag_files(app: &AppHandle, mode: WheelMode, files: Vec<FileInfo>) {
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files: Some(files) });
}

pub fn drag_mode(app: &AppHandle, mode: WheelMode) {
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files: None });
}

/// Mouse released. The drop event can arrive a little later, so wait 600 ms before hiding.
pub fn drag_end(app: &AppHandle) {
    let generation = HIDE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    log::info!("overlay: global drag ended (drop received so far: {})", DROP_RECEIVED.load(Ordering::SeqCst));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        if HIDE_GENERATION.load(Ordering::SeqCst) == generation && !DROP_RECEIVED.load(Ordering::SeqCst) {
            let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: false, mode: WheelMode::Convert, files: None });
            hide(&app);
        }
    });
}

/// Files were dropped on the wheel: keep it open, focus it, return full file info.
pub fn dropped(app: &AppHandle, paths: &[String]) -> Vec<FileInfo> {
    log::info!("overlay: {} file(s) dropped on the wheel", paths.len());
    DROP_RECEIVED.store(true, Ordering::SeqCst);
    HIDE_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(w) = window(app) {
        let _ = w.set_focus();
    }
    inspect_files(paths, true)
}
