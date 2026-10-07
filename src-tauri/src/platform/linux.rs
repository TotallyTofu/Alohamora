//! Linux: X11 via x11rb (pure Rust, no libX11). On Wayland there is no global pointer/keyboard access:
//! everything returns "unknown" (None / false), matching the Electron build's limits.

use std::sync::{Mutex, OnceLock};

use tauri::WebviewWindow;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt, KeyButMask, Window};
use x11rb::rust_connection::RustConnection;

use super::Pointer;

fn x11() -> Option<&'static Mutex<(RustConnection, Window)>> {
    static CONN: OnceLock<Option<Mutex<(RustConnection, Window)>>> = OnceLock::new();
    CONN.get_or_init(|| {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen)?.root;
        Some(Mutex::new((conn, root)))
    })
    .as_ref()
}

/// Pointer position and button/modifier state, or None without X11.
pub fn pointer() -> Option<Pointer> {
    let guard = x11()?.lock().ok()?;
    let (conn, root) = &*guard;
    let r = conn.query_pointer(*root).ok()?.reply().ok()?;
    let has = |m: KeyButMask| r.mask.contains(m);
    Some(Pointer {
        x: r.root_x as f64,
        y: r.root_y as f64,
        left_down: has(KeyButMask::BUTTON1),
        shift: has(KeyButMask::SHIFT),
        alt: has(KeyButMask::MOD1),
    })
}

/// (alt, shift) right now.
pub fn modifiers() -> (bool, bool) {
    pointer().map(|p| (p.alt, p.shift)).unwrap_or((false, false))
}

/// GTK maps the window without asking for focus when it was built with `.focused(false)`.
pub fn show_without_focus(win: &WebviewWindow) {
    let _ = win.show();
}

pub fn hide(win: &WebviewWindow) {
    let _ = win.hide();
}

/// Nothing extra on Linux (always-on-top and skip-taskbar come from the builder).
pub fn configure_overlay(_win: &WebviewWindow) {}
