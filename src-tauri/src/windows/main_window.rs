//! Port of windows/mainWindow.ts.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::app_state;

pub const LABEL: &str = "main";

/// Show the window when its UI reports ready (avoids a white flash).
static SHOW_ON_READY: AtomicBool = AtomicBool::new(false);

const DARK_BG: Color = Color(0x16, 0x16, 0x17, 0xff);
const LIGHT_BG: Color = Color(0xf3, 0xf3, 0xf2, 0xff);

pub fn create(app: &AppHandle, show_when_ready: bool) -> tauri::Result<WebviewWindow> {
    SHOW_ON_READY.store(show_when_ready, Ordering::SeqCst);
    app_state::clear_ready(LABEL);
    #[allow(unused_mut)]
    let mut b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Alohamora")
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 560.0)
        .visible(false)
        .additional_browser_args(super::WEBVIEW2_ARGS);
    #[cfg(target_os = "macos")]
    {
        // Traffic lights inside our 44 px header.
        b = b
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 15.0));
    }
    #[cfg(windows)]
    {
        // No native caption bar; the UI draws minimise/maximise/close (CaptionButtons.tsx).
        b = b.decorations(false);
    }
    let win = b.build()?;
    let dark = win.theme().map(|t| t == Theme::Dark).unwrap_or(false);
    let _ = win.set_background_color(Some(if dark { DARK_BG } else { LIGHT_BG }));
    Ok(win)
}

/// Show (re-creating it if it was destroyed) and focus.
pub fn show(app: &AppHandle) {
    match app.get_webview_window(LABEL) {
        Some(w) => {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        None => {
            if let Err(e) = create(app, true) {
                log::error!("could not create the main window: {e}");
            }
        }
    }
}

/// Called from `ui_ready` for the main window.
pub fn on_ui_ready(app: &AppHandle) {
    if SHOW_ON_READY.swap(false, Ordering::SeqCst) {
        show(app);
    }
}

/// Close button: macOS always hides; elsewhere hide when "close to tray" is on and a tray exists, else quit.
pub fn close_should_hide(_app: &AppHandle) -> bool {
    if app_state::is_quitting() {
        return false;
    }
    cfg!(target_os = "macos") || (alohamora_engine::settings::get().close_to_tray && app_state::is_tray_active())
}

pub fn is_focused(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).and_then(|w| w.is_focused().ok()).unwrap_or(false)
}
