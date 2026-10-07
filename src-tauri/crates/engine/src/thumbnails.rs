//! Port of src/main/thumbnails.ts: small JPEG data URLs (longest side <= 256 px).

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use alohamora_core::js::js_to_fixed;
use alohamora_core::types::{Category, FileInfo};

use crate::ffmpeg::{file_key, run_ffmpeg_to_buffer};
use crate::fsutil::data_url;
use crate::paths::p2s;
use crate::Result;

const SCALE: &str = "scale=256:256:force_original_aspect_ratio=decrease";

fn cache() -> &'static Mutex<HashMap<String, String>> {
    static C: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn s(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|x| x.to_string()).collect()
}

fn build(f: &FileInfo) -> Result<Option<String>> {
    let jpeg = match f.category {
        Some(Category::Image) => Some(crate::image::thumbnail_jpeg(Path::new(&f.path), f.fmt, 256)?),
        Some(Category::Video) => {
            if f.has_video != Some(true) {
                return Ok(None);
            }
            let t = (f.duration_sec.unwrap_or(0.0) * 0.1).min(1.0);
            let mut a = vec!["-ss".to_string(), js_to_fixed(t, 2), "-i".into(), f.path.clone()];
            a.extend(s(&["-frames:v", "1", "-vf", SCALE, "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"]));
            Some(run_ffmpeg_to_buffer(&a, None)?)
        }
        Some(Category::Audio) => {
            if f.has_cover != Some(true) {
                return Ok(None);
            }
            let mut a = vec!["-i".to_string(), f.path.clone()];
            a.extend(s(&["-map", "0:v:0", "-frames:v", "1", "-vf", SCALE, "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]));
            Some(run_ffmpeg_to_buffer(&a, None)?)
        }
        _ => None,
    };
    Ok(jpeg.map(|b| data_url("image/jpeg", &b)))
}

/// Cached by path + modification time (at most 200 entries).
pub fn make_thumbnail(f: &FileInfo) -> Result<Option<String>> {
    let key = file_key(Path::new(&f.path))?;
    if let Some(hit) = cache().lock().expect("thumbs").get(&key) {
        return Ok(Some(hit.clone()));
    }
    let url = build(f)?;
    if let Some(u) = &url {
        let mut c = cache().lock().expect("thumbs");
        if c.len() > 200 {
            c.clear();
        }
        c.insert(key, u.clone());
    }
    let _ = p2s;
    Ok(url)
}
