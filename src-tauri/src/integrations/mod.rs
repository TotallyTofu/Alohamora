//! Port of integrations/index.ts: turn OS integrations on/off when settings change.

pub mod global_drag;
pub mod legacy;
pub mod linux;
pub mod mac_helper;
pub mod windows;

use alohamora_core::types::Settings;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// At start-up (`prev` None) only turn ON what is enabled; afterwards apply what changed.
pub fn apply(app: &AppHandle, s: &Settings, prev: Option<&Settings>) {
    let changed = |now: bool, before: Option<bool>| match before {
        Some(b) => now != b,
        None => now,
    };
    if cfg!(windows) && changed(s.send_to_menu, prev.map(|p| p.send_to_menu)) {
        log_err("Send To", windows::set_send_to(s.send_to_menu));
    }
    if changed(s.context_menu, prev.map(|p| p.context_menu)) {
        if cfg!(windows) {
            log_err("context menu", windows::set_context_menu(s.context_menu));
        }
        if cfg!(target_os = "linux") {
            log_err("file manager menus", linux::set_file_manager_menus(s.context_menu));
        }
    }
    if changed(s.launch_at_login, prev.map(|p| p.launch_at_login)) {
        set_login_item(app, s.launch_at_login);
    }
    if cfg!(target_os = "macos") && prev.map(|p| p.show_in_dock != s.show_in_dock).unwrap_or(true) {
        crate::tray::set_dock_visible(app, s.show_in_dock);
    }
    if changed(s.global_drag_wheel, prev.map(|p| p.global_drag_wheel)) {
        match alohamora_engine::capabilities::get().global_drag.as_str() {
            "mac-helper" => if s.global_drag_wheel { mac_helper::start(app) } else { mac_helper::stop() },
            "hook" => if s.global_drag_wheel { global_drag::start(app) } else { global_drag::stop() },
            _ => {}
        }
    }
}

fn log_err(what: &str, r: std::io::Result<()>) {
    if let Err(e) = r {
        log::warn!("{what}: {e}");
    }
}

/// Windows/macOS: tauri-plugin-autostart (starts with --hidden). Linux: our own autostart .desktop file.
fn set_login_item(app: &AppHandle, enabled: bool) {
    if cfg!(target_os = "linux") {
        log_err("autostart", linux::set_autostart(enabled));
        return;
    }
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    if let Err(e) = r {
        log::warn!("launch at login: {e}");
    }
}
