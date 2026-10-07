//! Process-wide flags (port of appState.ts) plus "this window's UI has finished loading".

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

static QUITTING: AtomicBool = AtomicBool::new(false);
static TRAY_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn is_quitting() -> bool {
    QUITTING.load(Ordering::SeqCst)
}

pub fn set_quitting() {
    QUITTING.store(true, Ordering::SeqCst);
}

pub fn is_tray_active() -> bool {
    TRAY_ACTIVE.load(Ordering::SeqCst)
}

pub fn set_tray_active(v: bool) {
    TRAY_ACTIVE.store(v, Ordering::SeqCst);
}

fn ready() -> &'static (Mutex<HashSet<String>>, Condvar) {
    static R: OnceLock<(Mutex<HashSet<String>>, Condvar)> = OnceLock::new();
    R.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()))
}

/// Called by the `ui_ready` command: the window's React tree is mounted and its event listeners exist.
pub fn mark_ready(label: &str) {
    let (set, cv) = ready();
    set.lock().expect("ready set").insert(label.to_string());
    cv.notify_all();
}

/// Wait (at most `timeout`) until `label` has called `ui_ready`. Events sent earlier would be lost.
pub fn wait_ready(label: &str, timeout: Duration) -> bool {
    let (set, cv) = ready();
    let guard = set.lock().expect("ready set");
    let (guard, _) = cv.wait_timeout_while(guard, timeout, |s| !s.contains(label)).expect("ready set");
    guard.contains(label)
}

/// The main window is re-created after it was destroyed; its new page must report again.
pub fn clear_ready(label: &str) {
    ready().0.lock().expect("ready set").remove(label);
}
