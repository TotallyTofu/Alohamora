//! Port of integrations/argv.ts: files passed on the command line, by a second instance, or by macOS "Open With".

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use alohamora_core::types::WheelMode;
use alohamora_core::util::path_key;
use tauri::AppHandle;

use crate::windows::{main_window, overlay};

static PENDING: Mutex<Vec<String>> = Mutex::new(Vec::new());
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// Files that arrive before setup has finished wait here (macOS can send Opened before the app is ready).
static STARTED: AtomicBool = AtomicBool::new(false);

/// Existing file/folder paths from argv. Ignores flags, macOS `-psn_…`, the executable itself.
/// Relative paths are resolved against `cwd` (the second instance's working folder).
pub fn files_from_argv(argv: &[String], cwd: &Path) -> Vec<String> {
    let exe = std::env::current_exe().map(|p| path_key(&p)).unwrap_or_default();
    argv.iter()
        .skip(1)
        .filter(|a| !a.is_empty() && !a.starts_with('-') && !a.starts_with("psn_"))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| path_key(p) != exe && p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

fn open_batch(app: &AppHandle, batch: Vec<String>) {
    let app = app.clone();
    std::thread::spawn(move || overlay::open(&app, &batch, WheelMode::Convert, "argv", None));
}

/// Explorer may start one process per selected file: batch everything that arrives within 350 ms.
pub fn queue_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    PENDING.lock().expect("pending").extend(files);
    if !STARTED.load(Ordering::SeqCst) {
        return; // flushed by `mark_started`
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(350));
        if GENERATION.load(Ordering::SeqCst) != generation {
            return; // a newer arrival restarted the timer
        }
        let mut batch: Vec<String> = std::mem::take(&mut *PENDING.lock().expect("pending"));
        let mut seen = std::collections::HashSet::new();
        batch.retain(|p| seen.insert(p.clone()));
        if !batch.is_empty() {
            open_batch(&app, batch);
        }
    });
}

/// Setup finished: open whatever arrived early.
pub fn mark_started(app: &AppHandle) {
    STARTED.store(true, Ordering::SeqCst);
    let early: Vec<String> = std::mem::take(&mut *PENDING.lock().expect("pending"));
    queue_files(app, early);
}

/// `tauri-plugin-single-instance` callback: a second launch passes its argv and cwd here.
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let files = files_from_argv(&argv, Path::new(&cwd));
    if files.is_empty() {
        main_window::show(app);
    } else {
        queue_files(app, files);
    }
}

/// macOS `RunEvent::Opened`: Finder "Open With", Dock drops, `open -a Alohamora file`.
#[allow(dead_code)] // only used on macOS
pub fn on_opened_urls(app: &AppHandle, urls: &[tauri::Url]) {
    let files: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().to_string()).collect();
    queue_files(app, files);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_filtering() {
        let dir = std::env::temp_dir();
        let f = dir.join("alohamora-argv-test.txt");
        std::fs::write(&f, "x").unwrap();
        let argv = vec!["app".to_string(), "--hidden".into(), "-psn_0_1".into(), "alohamora-argv-test.txt".into(), "missing.txt".into()];
        let got = files_from_argv(&argv, &dir);
        assert_eq!(got, vec![f.to_string_lossy().to_string()]);
        let _ = std::fs::remove_file(f);
    }
}
