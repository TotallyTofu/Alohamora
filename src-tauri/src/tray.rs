//! Port of integrations/tray.ts + appMenu.ts. Windows/Linux: system tray. macOS: menu-bar icon (template image)
//! plus the application menu (App, Edit, Window) so ⌘C/⌘V/⌘Q work.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter};

use crate::app_state;
use crate::windows::main_window;

/// macOS: a template image (black + alpha) that the system tints for light/dark menu bars.
#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../icons/trayTemplate@2x.png");
/// Windows/Linux: a normal colour icon.
#[cfg(not(target_os = "macos"))]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "tray-open", "Open Alohamora", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit Alohamora", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Alohamora — drop files to convert")
        .menu(&menu)
        // macOS convention: a click opens the menu. Windows: left click opens the window. Linux: menu only (no click events).
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => main_window::show(app),
            "tray-quit" => crate::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if !cfg!(target_os = "macos") {
                    main_window::show(tray.app_handle());
                }
            }
        })
        .build(app)?;
    app_state::set_tray_active(true);
    Ok(())
}

/// macOS application menu. Windows/Linux have no menu bar.
pub fn install_app_menu(app: &AppHandle) -> tauri::Result<()> {
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    use tauri::menu::{AboutMetadata, SubmenuBuilder};
    let settings = MenuItem::with_id(app, "app-settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let app_menu = SubmenuBuilder::new(app, "Alohamora")
        .item(&PredefinedMenuItem::about(app, None, Some(AboutMetadata::default()))?)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().close_window().build()?;
    app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &window])?)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "app-settings" {
            main_window::show(app);
            let _ = app.emit_to(main_window::LABEL, "ev:navigate", "settings");
        }
    });
    Ok(())
}

/// macOS only: hide/show the Dock icon (menu-bar-only mode).
pub fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_dock_visibility(visible);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}
