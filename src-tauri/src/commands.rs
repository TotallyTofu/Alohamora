//! Every `invoke` the UI can make (port of ipc.ts, previews.ts, imagePreview.ts, metadata.ts handlers).
//! Rules: validate inputs, run blocking work on a worker thread, return errors as `{ message }`.

use std::path::{Path, PathBuf};

use alohamora_core::error::to_user_message;
use alohamora_core::types::{Capabilities, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate, MetadataInfo, OverlaySize, Settings, WheelMode};
use alohamora_engine::{capabilities, image_preview, inspect, jobs, metadata, paths, pdf, previews, settings, AppError};
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::windows::{main_window, overlay};

/// What a rejected `invoke` promise carries.
#[derive(Debug, Serialize)]
pub struct CmdError {
    pub message: String,
}

impl From<AppError> for CmdError {
    fn from(e: AppError) -> Self {
        CmdError { message: to_user_message(&e).message }
    }
}

impl From<String> for CmdError {
    fn from(message: String) -> Self {
        CmdError { message }
    }
}

type CmdResult<T> = Result<T, CmdError>;

/// Run blocking engine work off the async runtime threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> CmdResult<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| CmdError { message: e.to_string() })?
}

fn existing(p: &str) -> CmdResult<PathBuf> {
    let path = PathBuf::from(p);
    if path.exists() { Ok(path) } else { Err("Path does not exist".to_string().into()) }
}

#[tauri::command]
pub fn get_capabilities() -> Capabilities {
    capabilities::get()
}

#[tauri::command]
pub fn get_settings() -> Settings {
    settings::get()
}

/// Sanitize, save atomically, then listeners apply integrations and emit `ev:settings`.
#[tauri::command]
pub async fn set_settings(patch: serde_json::Value) -> CmdResult<Settings> {
    blocking(move || Ok(settings::update(&patch)?)).await
}

#[tauri::command]
pub async fn pick_files(window: WebviewWindow) -> CmdResult<Vec<String>> {
    let app = window.app_handle().clone();
    blocking(move || {
        let picked = app.dialog().file().set_parent(&window).blocking_pick_files();
        Ok(picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).map(|p| paths::p2s(&p)).collect())
    })
    .await
}

#[tauri::command]
pub async fn pick_folder(window: WebviewWindow) -> CmdResult<Option<String>> {
    let app = window.app_handle().clone();
    blocking(move || Ok(app.dialog().file().set_parent(&window).blocking_pick_folder().and_then(|f| f.into_path().ok()).map(|p| paths::p2s(&p)))).await
}

#[tauri::command]
pub async fn inspect_files(paths: Vec<String>, deep: bool) -> CmdResult<Vec<FileInfo>> {
    blocking(move || Ok(inspect::inspect_files(&paths, deep))).await
}

#[tauri::command]
pub fn start_job(req: JobRequest) -> String {
    jobs::queue::get().enqueue(req)
}

#[tauri::command]
pub fn cancel_job(id: String) {
    jobs::queue::get().cancel(&id);
}

#[tauri::command]
pub fn list_jobs() -> Vec<JobUpdate> {
    jobs::queue::get().list()
}

#[tauri::command]
pub fn reveal(app: AppHandle, path: String) -> CmdResult<()> {
    let p = existing(&path)?;
    app.opener().reveal_item_in_dir(p).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> CmdResult<()> {
    existing(&path)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub fn open_notices(app: AppHandle) -> CmdResult<()> {
    app.opener().open_path(paths::p2s(&paths::notices()), None::<&str>).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub async fn open_overlay(app: AppHandle, paths: Vec<String>, mode: WheelMode) -> CmdResult<()> {
    blocking(move || {
        overlay::open(&app, &paths, mode, "window", None);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn close_overlay(app: AppHandle) {
    overlay::hide(&app);
}

#[tauri::command]
pub fn resize_overlay(app: AppHandle, size: OverlaySize) {
    overlay::resize(&app, &size);
}

#[tauri::command]
pub async fn overlay_dropped(app: AppHandle, paths: Vec<String>) -> CmdResult<Vec<FileInfo>> {
    blocking(move || Ok(overlay::dropped(&app, &paths))).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUrl {
    pub url: String,
    pub is_proxy: bool,
}

#[tauri::command]
pub async fn preview_media(path: String) -> CmdResult<MediaUrl> {
    blocking(move || {
        let (file, is_proxy) = previews::media_source(&existing(&path)?)?;
        Ok(MediaUrl { url: crate::protocol::allow_file(&file), is_proxy })
    })
    .await
}

#[tauri::command]
pub async fn preview_frame(path: String, time_sec: f64, max_width: f64) -> CmdResult<String> {
    let w = if max_width > 0.0 { max_width as u32 } else { 640 };
    blocking(move || Ok(previews::frame(&existing(&path)?, time_sec.max(0.0), w)?)).await
}

#[tauri::command]
pub async fn preview_waveform(path: String, width: f64, height: f64) -> CmdResult<String> {
    let (w, h) = (if width > 0.0 { width } else { 800.0 }, if height > 0.0 { height } else { 120.0 });
    blocking(move || Ok(previews::waveform(&existing(&path)?, w, h)?)).await
}

#[tauri::command]
pub async fn preview_image(req: ImagePreviewRequest) -> CmdResult<ImagePreviewResult> {
    blocking(move || Ok(image_preview::preview_image(&req)?)).await
}

#[tauri::command]
pub async fn pdf_thumbnails(path: String, max_width: f64) -> CmdResult<Vec<String>> {
    let w = if max_width > 0.0 { max_width as u32 } else { 160 };
    blocking(move || Ok(pdf::thumbnails(&existing(&path)?, w, None)?)).await
}

#[tauri::command]
pub async fn read_metadata(path: String) -> CmdResult<MetadataInfo> {
    blocking(move || Ok(metadata::read_metadata(Path::new(&existing(&path)?))?)).await
}

/// The window's UI is mounted and listening: show the main window, release waiting overlay events.
#[tauri::command]
pub fn ui_ready(window: WebviewWindow) {
    log::info!("UI ready: {}", window.label());
    crate::app_state::mark_ready(window.label());
    // Diagnostics: is wry's OLE drop target on this window's WebView2 windows? (see rewrite/PROGRESS.md)
    #[cfg(windows)]
    {
        let w = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            log::info!("drop targets on '{}': {}", w.label(), crate::platform::describe_drop_targets(&w));
        });
    }
    if window.label() == main_window::LABEL {
        main_window::on_ui_ready(window.app_handle());
    }
}
