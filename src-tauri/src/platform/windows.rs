//! Windows: Win32 polling (no low-level hooks).

use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::{HWND, POINT};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MENU, VK_RBUTTON, VK_SHIFT};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, ShowWindow, SM_SWAPBUTTON, SW_HIDE, SW_SHOWNOACTIVATE};

use super::Pointer;

fn down(vk: u16) -> bool {
    // High bit = the key is down now.
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

/// Physical cursor position (Tauri apps are per-monitor DPI aware) and button/modifier state.
pub fn pointer() -> Option<Pointer> {
    let mut p = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut p) } == 0 {
        return None;
    }
    // Left-handed users swap the buttons; the "primary" button is then VK_RBUTTON.
    let primary = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
    Some(Pointer { x: p.x as f64, y: p.y as f64, left_down: down(primary), shift: down(VK_SHIFT), alt: down(VK_MENU) })
}

/// (alt, shift) right now.
pub fn modifiers() -> (bool, bool) {
    (down(VK_MENU), down(VK_SHIFT))
}

/// Electron's `showInactive()`: show without activating, so Explorer keeps the drag.
pub fn show_without_focus(win: &WebviewWindow) {
    match win.hwnd() {
        Ok(h) => unsafe {
            ShowWindow(h.0 as HWND, SW_SHOWNOACTIVATE);
        },
        Err(_) => {
            let _ = win.show();
        }
    }
}

/// Diagnostics for drag-and-drop: every window below `win` (the WebView2 windows) and whether an OLE drop target is
/// registered on it (Windows keeps it in the window property "OleDropTargetInterface").
pub fn describe_drop_targets(win: &WebviewWindow) -> String {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumChildWindows, GetClassNameW, GetPropW};

    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = unsafe { &mut *(lparam as *mut Vec<String>) };
        let mut class = [0u16; 128];
        let n = unsafe { GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32) }.max(0) as usize;
        let name = String::from_utf16_lossy(&class[..n]);
        let prop: Vec<u16> = "OleDropTargetInterface\0".encode_utf16().collect();
        let registered = !unsafe { GetPropW(hwnd, prop.as_ptr()) }.is_null();
        out.push(format!("{name}={}", if registered { "drop target" } else { "none" }));
        1
    }

    let Ok(h) = win.hwnd() else { return "no window handle".to_string() };
    let mut found: Vec<String> = Vec::new();
    unsafe {
        EnumChildWindows(h.0 as HWND, Some(each), &mut found as *mut Vec<String> as LPARAM);
    }
    found.join(", ")
}

/// `show_without_focus` calls ShowWindow itself, so tao still believes the window is hidden, and tao ignores a change from
/// "hidden" to "hidden": `win.hide()` alone would leave the wheel on screen. Hide it the same direct way too.
pub fn hide(win: &WebviewWindow) {
    let _ = win.hide();
    if let Ok(h) = win.hwnd() {
        unsafe {
            ShowWindow(h.0 as HWND, SW_HIDE);
        }
    }
}

pub fn configure_overlay(_win: &WebviewWindow) {}
