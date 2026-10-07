//! The two windows: `main` (the app) and `overlay` (the transparent wheel). Both load index.html;
//! the UI picks its view from the window label.

pub mod main_window;
pub mod overlay;

use tauri::{Emitter, Manager, Window, WindowEvent};

use crate::platform;

/// WebView2 (Windows) only — ignored elsewhere: wry's defaults (no SmartScreen, no Office/PDF UI) plus no
/// background networking (component updates, pings, reliability reports). The app never talks to the network.
pub const WEBVIEW2_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --disable-component-update --no-pings --disable-domain-reliability";

/// Payload of `ev:drop` (native file drag-and-drop on a window). x/y are CSS pixels inside the window.
#[derive(Clone, serde::Serialize)]
pub struct DropEvent {
    pub phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paths: Option<Vec<String>>,
    pub x: f64,
    pub y: f64,
    pub alt: bool,
    pub shift: bool,
}

/// What to divide a drag-drop position by to get CSS pixels. Tauri hands wry's numbers over as a `PhysicalPosition`
/// without converting them, but wry's macOS web view reports view points (already CSS pixels); only Windows reports real
/// physical pixels. Dividing points by the Retina scale as well put the cursor at half its place on a Mac, so the wheel
/// only ever saw the upper-left quadrant (9 to 12 o'clock) and a release at the centre landed on a slice.
fn css_divisor(scale: f64, positions_are_logical: bool) -> f64 {
    if positions_are_logical { 1.0 } else { scale }
}

fn drop_event(phase: &'static str, paths: Option<&Vec<std::path::PathBuf>>, pos: Option<tauri::PhysicalPosition<f64>>, scale: f64) -> DropEvent {
    let (alt, shift) = platform::modifiers();
    let (x, y) = pos.map(|p| (p.x / scale, p.y / scale)).unwrap_or((0.0, 0.0));
    DropEvent { phase, paths: paths.map(|v| v.iter().map(|p| p.to_string_lossy().to_string()).collect()), x, y, alt, shift }
}

/// Builder-level window event hook (`Builder::on_window_event`).
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } if window.label() == main_window::LABEL => {
            if main_window::close_should_hide(window.app_handle()) {
                api.prevent_close();
                let _ = window.hide();
            } else {
                crate::quit(window.app_handle());
            }
        }
        WindowEvent::DragDrop(dd) => {
            let scale = css_divisor(window.scale_factor().unwrap_or(1.0), cfg!(target_os = "macos"));
            let payload = match dd {
                tauri::DragDropEvent::Enter { paths, position } => drop_event("enter", Some(paths), Some(*position), scale),
                tauri::DragDropEvent::Over { position } => drop_event("over", None, Some(*position), scale),
                tauri::DragDropEvent::Drop { paths, position } => drop_event("drop", Some(paths), Some(*position), scale),
                tauri::DragDropEvent::Leave => drop_event("leave", None, None, scale),
                _ => return,
            };
            if payload.phase != "over" {
                log::info!("native drag-drop {} on '{}': {} path(s)", payload.phase, window.label(), payload.paths.as_ref().map_or(0, |p| p.len()));
            }
            let _ = window.emit_to(window.label(), "ev:drop", payload);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::css_divisor;

    #[test]
    fn logical_positions_are_not_scaled_again() {
        // macOS (Retina, scale 2): wry already gives CSS pixels, so the position must pass through unchanged.
        assert_eq!(css_divisor(2.0, true), 1.0);
    }

    #[test]
    fn physical_positions_are_divided_by_the_scale() {
        // Windows at 150%: wry gives physical pixels.
        assert_eq!(css_divisor(1.5, false), 1.5);
    }
}
