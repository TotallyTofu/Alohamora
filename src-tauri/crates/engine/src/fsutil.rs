//! Port of the file helpers in src/main/util.ts.

use std::path::Path;
use std::time::{Duration, SystemTime};

use crate::{AppError, Result};

/// Move a file; falls back to copy+delete across drives. Never overwrites.
pub fn move_file(src: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        return Err(AppError::other(format!("Destination exists: {}", dest.display())));
    }
    match std::fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            // copy into a new file (fails if it appeared meanwhile), then delete the source
            let mut from = std::fs::File::open(src)?;
            let mut to = std::fs::OpenOptions::new().write(true).create_new(true).open(dest)?;
            std::io::copy(&mut from, &mut to)?;
            drop(to);
            std::fs::remove_file(src)?;
            Ok(())
        }
        Err(e) => Err(AppError::Io(e)),
    }
}

/// Remove entries in `dir` last modified more than `max_age` ago. Never touches anything outside `dir`.
pub fn remove_older_than(dir: &Path, max_age: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    let now = SystemTime::now();
    let mut removed = 0;
    for entry in entries.flatten() {
        let p = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        if now.duration_since(modified).unwrap_or_default() <= max_age {
            continue;
        }
        let ok = if meta.is_dir() { std::fs::remove_dir_all(&p).is_ok() } else { std::fs::remove_file(&p).is_ok() };
        if ok {
            removed += 1;
        }
    }
    removed
}

/// Delete a folder, retrying a few times (Windows may still hold a handle for a moment).
pub fn remove_dir_with_retries(dir: &Path) {
    for _ in 0..4 {
        if !dir.exists() || std::fs::remove_dir_all(dir).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Bytes → "data:<mime>;base64,…".
pub fn data_url(mime: &str, bytes: &[u8]) -> String {
    use base64::Engine;
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}
