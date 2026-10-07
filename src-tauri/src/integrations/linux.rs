//! Linux: Nautilus script, Dolphin service menu and autostart entry (ports of linuxFileManagers.ts and loginItem.ts).
//! The functions exist on every OS so callers need no cfg; they are only called on Linux.

use std::io;
use std::path::PathBuf;

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// The command that starts this app: the AppImage when running as one, otherwise this executable.
pub fn self_command() -> String {
    std::env::var("APPIMAGE")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
}

#[cfg(unix)]
fn write_executable(path: &PathBuf, text: &str) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(path.parent().unwrap_or(path))?;
    std::fs::write(path, text)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}

#[cfg(not(unix))]
fn write_executable(path: &PathBuf, text: &str) -> io::Result<()> {
    std::fs::write(path, text)
}

/// Settings → "File manager menu" (reuses settings.contextMenu on Linux).
pub fn set_file_manager_menus(enabled: bool) -> io::Result<()> {
    let nautilus = home().join(".local/share/nautilus/scripts/Convert with Alohamora");
    let dolphin = home().join(".local/share/kio/servicemenus/alohamora.desktop");
    if !enabled {
        let _ = std::fs::remove_file(&nautilus);
        let _ = std::fs::remove_file(&dolphin);
        return Ok(());
    }
    let cmd = format!("\"{}\"", self_command());
    // Nautilus (GNOME Files): Scripts submenu; selected files are passed as arguments.
    write_executable(&nautilus, &format!("#!/bin/sh\nexec {cmd} \"$@\"\n"))?;
    // Dolphin (KDE): service menu; KF6 requires the file to be executable.
    let desktop = [
        "[Desktop Entry]", "Type=Service", "MimeType=all/allfiles;", "Actions=convert;", "X-KDE-Priority=TopLevel", "",
        "[Desktop Action convert]", "Name=Convert with Alohamora", "Icon=alohamora", &format!("Exec={cmd} %F"), "",
    ]
    .join("\n");
    write_executable(&dolphin, &desktop)
}

/// ~/.config/autostart/alohamora.desktop, started with --hidden.
pub fn set_autostart(enabled: bool) -> io::Result<()> {
    let file = home().join(".config/autostart/alohamora.desktop");
    if !enabled {
        let _ = std::fs::remove_file(&file);
        return Ok(());
    }
    std::fs::create_dir_all(file.parent().unwrap_or(&file))?;
    let exec = format!("\"{}\" \"--hidden\"", self_command());
    std::fs::write(&file, format!("[Desktop Entry]\nType=Application\nName=Alohamora\nExec={exec}\nX-GNOME-Autostart-enabled=true\nNoDisplay=false\n"))
}
