//! Windows: "Send to" shortcut and the Explorer right-click verb (ports of sendTo.ts and contextMenu.ts).
//! No reg.exe or PowerShell: the registry and COM are used directly. Stubs on other OSes.

use std::io;

#[cfg(windows)]
fn send_to_lnk() -> io::Result<std::path::PathBuf> {
    let appdata = std::env::var_os("APPDATA").ok_or_else(|| io::Error::other("APPDATA is not set"))?;
    Ok(std::path::PathBuf::from(appdata).join("Microsoft\\Windows\\SendTo\\Alohamora.lnk"))
}

/// %APPDATA%\Microsoft\Windows\SendTo\Alohamora.lnk → this executable.
#[cfg(windows)]
pub fn set_send_to(enabled: bool) -> io::Result<()> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    let lnk = send_to_lnk()?;
    if !enabled {
        let _ = std::fs::remove_file(&lnk);
        return Ok(());
    }
    let exe = std::env::current_exe()?;
    let err = |e: windows::core::Error| io::Error::other(e.to_string());
    unsafe {
        // S_FALSE (already initialised) is fine; a different apartment mode still lets us create the object.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        link.SetPath(&HSTRING::from(exe.as_os_str())).map_err(err)?;
        link.SetDescription(&HSTRING::from("Convert with Alohamora")).map_err(err)?;
        link.SetIconLocation(&HSTRING::from(exe.as_os_str()), 0).map_err(err)?;
        let file: IPersistFile = link.cast().map_err(err)?;
        file.Save(&HSTRING::from(lnk.as_os_str()), true).map_err(err)?;
    }
    Ok(())
}

const VERB_KEY: &str = "Software\\Classes\\*\\shell\\Alohamora";

/// HKCU\Software\Classes\*\shell\Alohamora: "Convert with Alohamora" on every file.
#[cfg(windows)]
pub fn set_context_menu(enabled: bool) -> io::Result<()> {
    use windows_registry::CURRENT_USER;
    let err = |e: windows_result::Error| io::Error::other(e.to_string());
    if !enabled {
        let _ = CURRENT_USER.remove_tree(VERB_KEY);
        return Ok(());
    }
    let exe = std::env::current_exe()?.to_string_lossy().to_string();
    let key = CURRENT_USER.create(VERB_KEY).map_err(err)?;
    key.set_string("", "Convert with Alohamora").map_err(err)?;
    key.set_string("Icon", &exe).map_err(err)?;
    key.set_string("MultiSelectModel", "Player").map_err(err)?;
    let cmd = CURRENT_USER.create(format!("{VERB_KEY}\\command")).map_err(err)?;
    cmd.set_string("", format!("\"{exe}\" \"%1\"")).map_err(err)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn set_send_to(_enabled: bool) -> io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn set_context_menu(_enabled: bool) -> io::Result<()> {
    let _ = VERB_KEY;
    Ok(())
}
