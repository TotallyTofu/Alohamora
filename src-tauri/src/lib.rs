//! Alohamora desktop app (Tauri 2). Port of src/main/index.ts.
//! The UI is unchanged React; this crate wires windows, commands, events and OS integrations to the engine.

mod app_state;
mod argv;
mod commands;
mod integrations;
mod notify;
mod platform;
mod protocol;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use alohamora_engine::{capabilities, fsutil, hw_video, jobs, paths, settings};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

use windows::{main_window, overlay};

/// Quit for real (tray "Quit", ⌘Q, closing the main window without close-to-tray).
pub fn quit(app: &AppHandle) {
    app_state::set_quitting();
    integrations::mac_helper::stop();
    integrations::global_drag::stop();
    app.exit(0);
}

/// Engine paths from Tauri's path resolver.
fn init_paths(app: &AppHandle) -> tauri::Result<()> {
    let p = app.path();
    let exe_dir = std::env::current_exe()?.parent().map(PathBuf::from).unwrap_or_default();
    paths::init(paths::Paths {
        bin_dir: exe_dir,
        resource_dir: p.resource_dir()?,
        config_dir: p.app_config_dir()?,
        cache_dir: p.app_cache_dir()?,
        data_dir: p.app_data_dir()?,
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: app.package_info().version.to_string(),
    });
    Ok(())
}

/// `alohamora --selftest [--only=<group|prefix>] [--out=<dir>]`: runs without creating any window, so it also
/// works on a headless CI runner. Paths come from Tauri's resource-dir rules for this executable.
fn run_selftest(context: &tauri::Context, args: &[String]) -> i32 {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)).unwrap_or_default();
    let resource_dir = tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default()).unwrap_or_else(|_| exe_dir.clone());
    let work = args
        .iter()
        .find_map(|a| a.strip_prefix("--out=").map(PathBuf::from))
        .unwrap_or_else(|| std::env::temp_dir().join("alohamora-selftest"));
    paths::init(paths::Paths {
        bin_dir: exe_dir,
        resource_dir,
        config_dir: work.join("config"),
        cache_dir: work.join("cache"),
        data_dir: work.join("data"),
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: context.package_info().version.to_string(),
    });
    settings::load_defaults_in_memory();
    capabilities::detect();
    let only = args.iter().find_map(|a| a.strip_prefix("--only=").map(String::from));
    alohamora_engine::selftest::run(only.as_deref(), &work)
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    init_paths(&handle)?;
    integrations::legacy::migrate_settings(&paths::get().config_dir);
    let s = settings::load(paths::get().config_dir.clone());
    capabilities::detect();

    let emit_handle = handle.clone();
    let finish_handle = handle.clone();
    jobs::queue::init(
        Arc::new(move |u| {
            let _ = emit_handle.emit("ev:job-update", u);
        }),
        Arc::new(move |u| notify::job_finished(&finish_handle, u)),
    );

    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let initial = argv::files_from_argv(&args, &cwd);
    let hidden = args.iter().any(|a| a == "--hidden");
    main_window::create(&handle, initial.is_empty() && !hidden)?;
    overlay::create(&handle)?;
    tray::install_app_menu(&handle)?;
    tray::create(&handle)?;
    integrations::apply(&handle, &s, None);

    let settings_handle = handle.clone();
    settings::on_changed(move |now, prev| {
        let _ = settings_handle.emit("ev:settings", now);
        integrations::apply(&settings_handle, now, Some(prev));
    });

    // Background: 1-frame hardware encoder tests and clean-up never block start-up.
    std::thread::spawn(hw_video::detect_hardware_video);
    std::thread::spawn(|| {
        let day = Duration::from_secs(24 * 60 * 60);
        let proxies = fsutil::remove_older_than(&paths::cache_dir("proxies"), day * 7);
        let jobs = fsutil::remove_older_than(&paths::jobs_temp_root(), day);
        if proxies + jobs > 0 {
            log::info!("Housekeeping removed {proxies} proxies, {jobs} job folders");
        }
    });

    // Diagnostics: Explorer cannot drop files onto a window of a process with higher privileges ("Run as administrator").
    // Log the integrity level: Medium = normal, High = administrator.
    #[cfg(windows)]
    std::thread::spawn(|| {
        if let Ok(o) = alohamora_engine::process::command(std::path::Path::new("whoami")).arg("/groups").output() {
            let text = String::from_utf8_lossy(&o.stdout);
            let level = text.lines().find(|l| l.contains("Mandatory Label")).and_then(|l| l.split("  ").next()).unwrap_or("unknown");
            log::info!("process integrity: {}", level.trim());
        }
    });

    argv::queue_files(&handle, initial);
    argv::mark_started(&handle);
    log::info!("Alohamora ready");
    Ok(())
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let context = tauri::generate_context!();
    if args.iter().any(|a| a == "--selftest") {
        std::process::exit(run_selftest(&context, &args));
    }
    let app = tauri::Builder::default()
        // Must be the first plugin: a second launch hands its argv to us and exits.
        .plugin(tauri_plugin_single_instance::init(argv::on_second_instance))
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .register_asynchronous_uri_scheme_protocol("kfile", protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::get_capabilities,
            commands::get_settings,
            commands::set_settings,
            commands::pick_files,
            commands::pick_folder,
            commands::inspect_files,
            commands::start_job,
            commands::cancel_job,
            commands::list_jobs,
            commands::reveal,
            commands::open_path,
            commands::open_notices,
            commands::open_overlay,
            commands::close_overlay,
            commands::resize_overlay,
            commands::overlay_dropped,
            commands::preview_media,
            commands::preview_frame,
            commands::preview_waveform,
            commands::preview_image,
            commands::pdf_thumbnails,
            commands::read_metadata,
            commands::ui_ready,
        ])
        .on_window_event(windows::on_window_event)
        .setup(setup)
        .build(context)
        .expect("error while building Alohamora");

    app.run(|handle, event| match event {
        // Keep running in the tray when the last window closes; only an explicit quit exits.
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() && !app_state::is_quitting() {
                api.prevent_exit();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => argv::on_opened_urls(handle, &urls),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => main_window::show(handle),
        _ => {
            let _ = handle;
        }
    });
}
