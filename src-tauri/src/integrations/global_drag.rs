//! Global drag wheel on Windows and Linux X11 (replaces uiohook-napi). A 60 Hz poller thread — no low-level
//! hooks — runs only while the setting is on. Logic: primary button down and moved > 12 px = dragging;
//! Shift held while dragging shows the wheel at the cursor; Alt picks the Tools ring; release = drag end.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use alohamora_core::types::WheelMode;
use tauri::AppHandle;

use crate::platform;
use crate::windows::overlay;

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start(app: &AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut down_at: Option<(f64, f64)> = None;
        let mut dragging = false;
        let mut shown = false;
        let mut last_mode = WheelMode::Convert;
        while RUNNING.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(16));
            let Some(p) = platform::pointer() else { continue };
            let mode = if p.alt { WheelMode::Tools } else { WheelMode::Convert };
            if p.left_down {
                match down_at {
                    None => {
                        down_at = Some((p.x, p.y));
                        dragging = false;
                    }
                    Some((x0, y0)) if !dragging && (p.x - x0).hypot(p.y - y0) > 12.0 => dragging = true,
                    _ => {}
                }
                if dragging && p.shift && !shown {
                    shown = true;
                    last_mode = mode;
                    overlay::drag_start(&app, mode, (p.x, p.y), None);
                } else if shown && mode != last_mode {
                    last_mode = mode;
                    overlay::drag_mode(&app, mode);
                }
            } else if down_at.is_some() {
                down_at = None;
                dragging = false;
                if shown {
                    shown = false;
                    overlay::drag_end(&app);
                }
            }
        }
    });
    log::info!("Global drag wheel started");
}

pub fn stop() {
    if RUNNING.swap(false, Ordering::SeqCst) {
        log::info!("Global drag wheel stopped");
    }
}
