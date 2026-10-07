//! macOS: AppKit through objc2. The global drag wheel uses the Swift helper, so `pointer()` is not needed.

use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSWindow, NSWindowCollectionBehavior};
use tauri::WebviewWindow;

use super::Pointer;

/// NSPopUpMenuWindowLevel (= kCGPopUpMenuWindowLevel): above normal windows and the Dock, like Electron's 'pop-up-menu'.
const POP_UP_MENU_WINDOW_LEVEL: isize = 101;

pub fn pointer() -> Option<Pointer> {
    None
}

/// (alt, shift) right now. `+[NSEvent modifierFlags]` needs no permission.
pub fn modifiers() -> (bool, bool) {
    let f = NSEvent::modifierFlags_class();
    (f.contains(NSEventModifierFlags::Option), f.contains(NSEventModifierFlags::Shift))
}

fn with_ns_window(win: &WebviewWindow, f: impl FnOnce(&NSWindow) + Send + 'static) {
    let w = win.clone();
    let _ = win.run_on_main_thread(move || {
        if let Ok(ptr) = w.ns_window() {
            // SAFETY: Tauri returns a valid NSWindow pointer and we are on the main thread.
            let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            f(ns);
        }
    });
}

/// Show above other apps without activating Alohamora (Electron's showInactive()).
pub fn show_without_focus(win: &WebviewWindow) {
    with_ns_window(win, |ns| ns.orderFrontRegardless());
}

pub fn hide(win: &WebviewWindow) {
    let _ = win.hide();
}

/// Pop-up-menu level, on every Space and over full-screen apps.
pub fn configure_overlay(win: &WebviewWindow) {
    with_ns_window(win, |ns| {
        ns.setLevel(POP_UP_MENU_WINDOW_LEVEL);
        ns.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary);
    });
}
