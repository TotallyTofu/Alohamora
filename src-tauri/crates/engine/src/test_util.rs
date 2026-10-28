//! Helpers for the unit tests (compiled only for `cargo test`).

use std::path::{Path, PathBuf};
use std::sync::Once;

use crate::paths::{self, Paths};

/// A fresh folder under the system temp folder, deleted again on drop.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(tag: &str) -> Self {
        let p = std::env::temp_dir().join(format!("alohamora-test-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&p).expect("create temp dir");
        TempDir(p)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// Write `data` to `<dir>/<name>` and return the path.
    pub fn file(&self, name: &str, data: &[u8]) -> PathBuf {
        let p = self.0.join(name);
        std::fs::write(&p, data).expect("write test file");
        p
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// `paths::init` for tests: every folder lives in one shared temp folder (job folders inside it have unique ids).
/// Safe to call from every test.
pub fn init_paths() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let root = std::env::temp_dir().join("alohamora-test-paths");
        paths::init(Paths {
            bin_dir: root.join("bin"),
            resource_dir: root.join("resources"),
            config_dir: root.join("config"),
            cache_dir: root.join("cache"),
            data_dir: root.join("data"),
            jobs_temp_root: root.join("jobs"),
            app_version: "0.0.0-test".into(),
        });
    });
}
