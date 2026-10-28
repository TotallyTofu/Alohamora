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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;

    #[test]
    fn move_file_moves_and_never_overwrites() {
        let dir = TempDir::new("move");
        let src = dir.file("a.txt", b"new");
        let dest = dir.path().join("b.txt");
        move_file(&src, &dest).expect("move");
        assert!(!src.exists());
        assert_eq!(std::fs::read(&dest).unwrap(), b"new");

        let again = dir.file("c.txt", b"other");
        assert!(move_file(&again, &dest).is_err(), "an existing destination must not be replaced");
        assert_eq!(std::fs::read(&dest).unwrap(), b"new");
        assert!(again.exists());
    }

    #[test]
    fn remove_older_than_keeps_recent_files() {
        let dir = TempDir::new("prune");
        let old = dir.file("old.bin", b"x");
        let recent = dir.file("recent.bin", b"y");
        let two_hours_ago = SystemTime::now() - Duration::from_secs(7200);
        std::fs::File::options().write(true).open(&old).unwrap().set_modified(two_hours_ago).unwrap();
        assert_eq!(remove_older_than(dir.path(), Duration::from_secs(3600)), 1);
        assert!(!old.exists());
        assert!(recent.exists());
        assert_eq!(remove_older_than(&dir.path().join("missing"), Duration::ZERO), 0);
    }

    #[test]
    fn data_urls() {
        assert_eq!(data_url("text/plain", b"hi"), "data:text/plain;base64,aGk=");
        assert_eq!(data_url("image/png", b""), "data:image/png;base64,");
    }
}
