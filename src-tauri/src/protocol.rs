//! The `kfile` URI scheme (port of protocol.ts `kfile://`): lets <video>/<audio>/<img> load local files the
//! backend has explicitly allowed, with HTTP Range support. Nothing else on disk is reachable.
//! URL form differs per OS (wry): Windows uses `http://kfile.localhost/<path>`, macOS/Linux `kfile://localhost/<path>`.

use std::collections::HashSet;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::util::path_key;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

/// Same characters as JavaScript's encodeURIComponent leaves alone.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'!').remove(b'~').remove(b'*').remove(b'\'').remove(b'(').remove(b')');

/// Largest body for one Range response; players ask again for the rest.
const MAX_CHUNK: u64 = 4 * 1024 * 1024;

fn allowed() -> &'static Mutex<HashSet<String>> {
    static A: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Allow the UI to load this file and return its URL.
pub fn allow_file(file: &Path) -> String {
    let abs = std::path::absolute(file).unwrap_or_else(|_| file.to_path_buf());
    allowed().lock().expect("kfile allow-list").insert(path_key(&abs));
    let encoded = utf8_percent_encode(&abs.to_string_lossy(), COMPONENT).to_string();
    if cfg!(windows) { format!("http://kfile.localhost/{encoded}") } else { format!("kfile://localhost/{encoded}") }
}

fn mime_for(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .expect("valid response")
}

/// "bytes=a-b" / "bytes=a-" / "bytes=-n" → inclusive (start, end), or None when unsatisfiable.
pub fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", "") => return None,
        ("", n) => {
            let n: u64 = n.parse().ok()?;
            (size.saturating_sub(n), size.saturating_sub(1))
        }
        (s, "") => (s.parse().ok()?, size.saturating_sub(1)),
        (s, e) => (s.parse().ok()?, e.parse::<u64>().ok()?.min(size.saturating_sub(1))),
    };
    if size == 0 || start > end || start >= size { None } else { Some((start, end)) }
}

fn read_range(p: &Path, start: u64, len: u64) -> std::io::Result<Vec<u8>> {
    let mut f = std::fs::File::open(p)?;
    f.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::with_capacity(len as usize);
    f.take(len).read_to_end(&mut buf)?;
    Ok(buf)
}

fn respond(req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let cors = |b: tauri::http::response::Builder| {
        b.header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, Accept-Ranges, Content-Length")
    };
    if req.method() == tauri::http::Method::OPTIONS {
        return cors(Response::builder().status(StatusCode::NO_CONTENT))
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
            .body(Vec::new())
            .expect("valid response");
    }
    let raw = req.uri().path().trim_start_matches('/');
    let decoded = percent_decode_str(raw).decode_utf8_lossy().to_string();
    let file = PathBuf::from(decoded);
    if !allowed().lock().expect("kfile allow-list").contains(&path_key(&file)) {
        return status(StatusCode::FORBIDDEN);
    }
    let Ok(meta) = std::fs::metadata(&file) else { return status(StatusCode::NOT_FOUND) };
    let size = meta.len();
    let mime = mime_for(&file);
    if let Some(range) = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()) {
        let Some((start, end)) = parse_range(range, size) else {
            return cors(Response::builder().status(StatusCode::RANGE_NOT_SATISFIABLE))
                .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                .body(Vec::new())
                .expect("valid response");
        };
        let end = end.min(start + MAX_CHUNK - 1);
        let Ok(body) = read_range(&file, start, end - start + 1) else { return status(StatusCode::NOT_FOUND) };
        return cors(Response::builder().status(StatusCode::PARTIAL_CONTENT))
            .header(header::CONTENT_TYPE, mime)
            .header(header::CONTENT_LENGTH, body.len().to_string())
            .header(header::CONTENT_RANGE, format!("bytes {start}-{}/{size}", start + body.len() as u64 - 1))
            .header(header::ACCEPT_RANGES, "bytes")
            .body(body)
            .expect("valid response");
    }
    let Ok(body) = std::fs::read(&file) else { return status(StatusCode::NOT_FOUND) };
    cors(Response::builder().status(StatusCode::OK))
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(body)
        .expect("valid response")
}

/// Registered with `register_asynchronous_uri_scheme_protocol("kfile", handle)`. File I/O runs off the UI thread.
pub fn handle<R: Runtime>(_ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    tauri::async_runtime::spawn_blocking(move || responder.respond(respond(&req)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=10-19", 100), Some((10, 19)));
        assert_eq!(parse_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=50-500", 100), Some((50, 99)));
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=5-1", 100), None);
        assert_eq!(parse_range("items=0-1", 100), None);
    }

    #[test]
    fn urls_are_encoded() {
        // A path that is absolute on this OS, and how its URL ends (Windows paths contain a drive and backslashes).
        let (path, tail) = if cfg!(windows) {
            (r"C:\tmp\a b#c.mp4", "C%3A%5Ctmp%5Ca%20b%23c.mp4")
        } else {
            ("/tmp/a b#c.mp4", "%2Ftmp%2Fa%20b%23c.mp4")
        };
        let url = allow_file(Path::new(path));
        assert!(url.ends_with(tail), "{url}");
    }
}
