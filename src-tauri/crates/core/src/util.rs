//! Port of the pure parts of src/main/util.ts.

use std::path::{Path, PathBuf};

/// Key for comparing paths: Windows and default macOS volumes are case-insensitive, Linux is case-sensitive.
/// Never call `.to_lowercase()` on a path anywhere else; use this.
pub fn path_key(p: &Path) -> String {
    let abs: PathBuf = std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
    let s = abs.to_string_lossy().to_string();
    if cfg!(target_os = "linux") { s } else { s.to_lowercase() }
}

/// Milliseconds since 1970 (JavaScript `Date.now()`).
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// "geese.mp4" from "/a/b/geese.mp4" (works with both separators).
pub fn base_name(p: &str) -> String {
    p.rsplit(['/', '\\']).next().unwrap_or(p).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys() {
        let a = path_key(Path::new("/tmp/Abc.txt"));
        if cfg!(target_os = "linux") {
            assert!(a.ends_with("Abc.txt"));
        } else {
            assert!(a.ends_with("abc.txt"));
        }
        assert_eq!(base_name("C:\\x\\y.mp4"), "y.mp4");
        assert_eq!(base_name("/x/y.mp4"), "y.mp4");
    }
}
