//! First start of the Tauri build: copy settings from the Electron build (or the older Kabooks build)
//! when the new settings file does not exist yet. Replaces integrations/legacy.ts.

use std::path::{Path, PathBuf};

/// Electron's userData folders (`app.getPath('appData')/<name>`), newest name first.
fn electron_settings_candidates() -> Vec<PathBuf> {
    let app_data: Option<PathBuf> = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };
    let Some(base) = app_data else { return Vec::new() };
    ["Alohamora", "alohamora", "Kabooks", "kabooks"].iter().map(|n| base.join(n).join("settings.json")).collect()
}

/// Returns true when settings were copied (integrations are then re-applied with this executable's path).
pub fn migrate_settings(config_dir: &Path) -> bool {
    let target = config_dir.join("settings.json");
    if target.exists() {
        return false;
    }
    let Some(old) = electron_settings_candidates().into_iter().find(|p| p.exists()) else { return false };
    if std::fs::create_dir_all(config_dir).is_err() {
        return false;
    }
    match std::fs::copy(&old, &target) {
        Ok(_) => {
            log::info!("Copied settings from {}", old.display());
            true
        }
        Err(e) => {
            log::warn!("Could not copy the old settings: {e}");
            false
        }
    }
}
