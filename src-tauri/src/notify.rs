//! Port of notify.ts. Desktop notifications cannot report clicks in tauri-plugin-notification, so
//! "click to reveal" from the Electron build is gone (documented gap); "reveal when done" still works.

use alohamora_core::types::{JobStatus, JobUpdate};
use alohamora_core::util::base_name;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::windows::{main_window, overlay};

pub fn job_finished(app: &AppHandle, u: &JobUpdate) {
    let s = alohamora_engine::settings::get();
    if u.status == JobStatus::Done && s.reveal_when_done {
        if let Some(first) = u.outputs.first() {
            let _ = app.opener().reveal_item_in_dir(first);
        }
    }
    if !s.notify_when_done || !matches!(u.status, JobStatus::Done | JobStatus::Error) {
        return;
    }
    if overlay::is_visible(app) || main_window::is_focused(app) {
        return; // the user is already looking
    }
    let (title, body) = if u.status == JobStatus::Done {
        let what = if u.outputs.len() == 1 { base_name(&u.outputs[0]) } else { format!("{} files saved", u.outputs.len()) };
        let note = u.note.as_deref().map(|n| format!(" · {n}")).unwrap_or_default();
        (format!("{} — done", u.label), format!("{what}{note}"))
    } else {
        (format!("{} failed", u.label), u.error.clone().unwrap_or_else(|| "Something went wrong".into()))
    };
    let _ = app.notification().builder().title(title).body(body).show();
}
