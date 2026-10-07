//! Port of src/main/paths.ts. The app fills `Paths` once at start-up (`init`); everything else reads `get()`.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone)]
pub struct Paths {
    /// Folder that holds the sidecars (ffmpeg, ffprobe, alohamora-drag-helper): the main executable's folder.
    pub bin_dir: PathBuf,
    /// Tauri resource folder: tessdata/, pdfium/, fonts/, THIRD_PARTY_NOTICES.md.
    pub resource_dir: PathBuf,
    /// settings.json lives here.
    pub config_dir: PathBuf,
    /// Preview proxies and other caches.
    pub cache_dir: PathBuf,
    /// User-writable data (optional heif-enc on Windows).
    pub data_dir: PathBuf,
    /// Job scratch folders: <temp>/alohamora-jobs/<id>.
    pub jobs_temp_root: PathBuf,
    pub app_version: String,
}

static PATHS: OnceLock<Paths> = OnceLock::new();

/// Windows: Tauri returns folders like `\\?\C:\app\resources`. C libraries (Tesseract) append "/eng.traineddata" to the
/// tessdata folder, and the `\\?\` form does not accept "/", so use the plain `C:\app\resources` form. (Deviation from the
/// plan, owner-approved: the plan was validated on Linux only; see rewrite/PROGRESS.md.)
fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with(r"UNC\") => PathBuf::from(rest),
        _ => p,
    }
}

/// Call once at start-up. Later calls are ignored.
pub fn init(mut p: Paths) {
    p.bin_dir = strip_verbatim(p.bin_dir);
    p.resource_dir = strip_verbatim(p.resource_dir);
    let _ = PATHS.set(p);
}

pub fn get() -> &'static Paths {
    PATHS.get().expect("paths::init must be called at start-up")
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

/// A bundled helper program. Installed apps have `<bin_dir>/ffmpeg`; dev runs that point `bin_dir` at
/// src-tauri/binaries find the Tauri sidecar name `ffmpeg-<target triple>` instead.
pub fn sidecar(name: &str) -> PathBuf {
    let plain = get().bin_dir.join(exe_name(name));
    if plain.exists() {
        return plain;
    }
    let with_triple = get().bin_dir.join(exe_name(&format!("{name}-{}", env!("ALOHAMORA_TARGET_TRIPLE"))));
    if with_triple.exists() { with_triple } else { plain }
}

pub fn ffmpeg() -> PathBuf {
    sidecar("ffmpeg")
}

pub fn ffprobe() -> PathBuf {
    sidecar("ffprobe")
}

pub fn mac_drag_helper() -> PathBuf {
    sidecar("alohamora-drag-helper")
}

pub fn tessdata_dir() -> PathBuf {
    get().resource_dir.join("tessdata")
}

/// OCR languages that have a `<lang>.traineddata` file, sorted (capabilities.ocrLanguages).
pub fn installed_ocr_langs() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(tessdata_dir())
        .map(|rd| rd.filter_map(|e| e.ok()).filter_map(|e| e.file_name().to_str()?.strip_suffix(".traineddata").map(String::from)).collect())
        .unwrap_or_default();
    v.sort();
    v
}

pub fn fonts_dir() -> PathBuf {
    get().resource_dir.join("fonts")
}

/// Folder holding the PDFium library:
/// - macOS app bundle: Contents/Frameworks (the bundler signs it there, which notarization requires);
/// - Windows/Linux installs and dev runs: <resources>/pdfium;
/// - macOS dev runs (Tauri copies no frameworks in dev): the fetched copy in src-tauri/resources/pdfium.
pub fn pdfium_dir() -> PathBuf {
    let frameworks = get().bin_dir.join("../Frameworks");
    if cfg!(target_os = "macos") && frameworks.join("libpdfium.dylib").exists() {
        return frameworks;
    }
    let bundled = get().resource_dir.join("pdfium");
    if bundled.is_dir() || !cfg!(debug_assertions) {
        return bundled;
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../resources/pdfium")
}

pub fn notices() -> PathBuf {
    get().resource_dir.join("THIRD_PARTY_NOTICES.md")
}

/// Optional heif-enc on Windows: the user copies heif-enc.exe and its DLLs here.
pub fn heif_enc_candidates() -> Vec<PathBuf> {
    vec![get().data_dir.join("heif").join(exe_name("heif-enc")), get().resource_dir.join("heif").join(exe_name("heif-enc"))]
}

/// A sub-folder of the cache directory, created on demand.
pub fn cache_dir(sub: &str) -> PathBuf {
    let p = get().cache_dir.join(sub);
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn jobs_temp_root() -> PathBuf {
    let p = get().jobs_temp_root.clone();
    let _ = std::fs::create_dir_all(&p);
    p
}

/// Find an executable on PATH (Linux/macOS), or None.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let p = dir.join(exe_name(name));
        if is_executable(&p) {
            return Some(p);
        }
    }
    None
}

fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(p).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// A path as a String for FFmpeg arguments and JSON.
pub fn p2s(p: &Path) -> String {
    p.to_string_lossy().to_string()
}
