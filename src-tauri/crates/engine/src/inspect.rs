//! Port of src/main/inspect.ts.

use std::path::Path;

use alohamora_core::naming::split_name;
use alohamora_core::registry::{category_of, ext_of, fmt_from_ext};
use alohamora_core::types::{Category, FileInfo};
use alohamora_core::util::base_name;

use crate::ffmpeg::probe;
use crate::par::map_limit;
use crate::thumbnails::make_thumbnail;
use crate::Result;

const MAX_FILES: usize = 500;

/// Folders → their direct files (sorted by name). De-duplicates. At most 500 files.
pub fn expand_paths(paths: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for p in paths {
        let path = Path::new(p);
        if path.is_dir() {
            let mut files: Vec<String> = std::fs::read_dir(path)
                .map(|rd| rd.flatten().filter(|e| e.path().is_file()).map(|e| e.path().to_string_lossy().to_string()).collect())
                .unwrap_or_default();
            files.sort_by_key(|f| base_name(f).to_lowercase());
            out.extend(files);
        } else if path.is_file() {
            out.push(p.clone());
        }
        if out.len() >= MAX_FILES {
            break;
        }
    }
    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .map(|p| std::path::absolute(&p).map(|a| a.to_string_lossy().to_string()).unwrap_or(p))
        .filter(|p| seen.insert(p.clone()))
        .take(MAX_FILES)
        .collect()
}

pub fn inspect_basic(file_path: &str) -> FileInfo {
    let name = base_name(file_path);
    let ext = ext_of(file_path);
    let fmt = fmt_from_ext(&ext);
    let size = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    FileInfo {
        path: file_path.to_string(),
        base: split_name(&name).0,
        name,
        ext,
        fmt,
        category: fmt.map(category_of),
        size,
        ..Default::default()
    }
}

fn deep_inner(out: &mut FileInfo) -> Result<()> {
    match out.category {
        Some(Category::Video) | Some(Category::Audio) => {
            let p = probe(Path::new(&out.path))?;
            out.duration_sec = Some(p.duration_sec);
            out.has_video = Some(p.video.is_some());
            out.has_audio = Some(p.audio.is_some());
            out.has_cover = Some(p.has_cover);
            if let Some(v) = &p.video {
                out.width = Some(v.display_width);
                out.height = Some(v.display_height);
                out.video_codec = Some(v.codec.clone());
                out.fps = Some(v.fps);
            }
            if let Some(a) = &p.audio {
                out.audio_codec = Some(a.codec.clone());
                out.sample_rate = Some(a.sample_rate);
                out.channels = Some(a.channels);
            }
        }
        Some(Category::Image) => {
            let (w, h) = crate::image::display_size(Path::new(&out.path), out.fmt)?;
            out.width = Some(w);
            out.height = Some(h);
        }
        Some(Category::Pdf) => {
            let info = crate::pdf::info_with_thumbnail(Path::new(&out.path), 256)?;
            out.pages = Some(info.pages);
            out.width = Some(info.first_width_pt.round() as u32);
            out.height = Some(info.first_height_pt.round() as u32);
            out.thumbnail = info.thumbnail;
        }
        _ => {}
    }
    if out.thumbnail.is_none() {
        out.thumbnail = make_thumbnail(out)?;
    }
    Ok(())
}

/// Adds durations, sizes, page counts and a thumbnail. Never fails: problems go into `error`.
pub fn inspect_deep(info: &FileInfo) -> FileInfo {
    let mut out = info.clone();
    out.deep = Some(true);
    if let Err(e) = deep_inner(&mut out) {
        log::warn!("inspectDeep failed {}: {e:?}", out.path);
        out.error = Some(e.to_string());
    }
    out
}

pub fn inspect_files(paths: &[String], deep: bool) -> Vec<FileInfo> {
    let basic: Vec<FileInfo> = expand_paths(paths).iter().map(|p| inspect_basic(p)).collect();
    if !deep {
        return basic;
    }
    map_limit(&basic, 4, inspect_deep)
}
