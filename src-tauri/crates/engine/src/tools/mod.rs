//! Port of src/main/tools/index.ts: one runner per tool.

pub mod audio;
pub mod image;
pub mod pdf;
pub mod subtitle;
pub mod video;

use alohamora_core::types::{FileInfo, ToolId};
use serde_json::Value;

use crate::jobs::JobContext;
use crate::Result;

/// Run one tool. Per-file tools get exactly one file; multi-input tools (join, merge, collage, make PDF) get all.
pub fn run(tool: ToolId, files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    use ToolId::*;
    match tool {
        VideoCompress => video::compress(&files[0], options, ctx),
        VideoMetadata => video::metadata(&files[0], options, ctx),
        VideoMute => video::mute(&files[0], ctx),
        VideoTrim => video::trim(&files[0], options, ctx),
        VideoCrop => video::crop(&files[0], options, ctx),
        VideoSpeed => video::speed(&files[0], options, ctx),
        VideoSnapshot => video::snapshot(&files[0], options, ctx),
        VideoSplit => video::split(&files[0], options, ctx),
        VideoRedact => video::redact(&files[0], options, ctx),
        VideoJoin => video::join(files, options, ctx),
        AudioCompress => audio::compress(&files[0], options, ctx),
        AudioNormalize => audio::normalize(&files[0], options, ctx),
        AudioTrim => audio::trim(&files[0], options, ctx),
        AudioChannels => audio::channels(&files[0], options, ctx),
        AudioVisualize => audio::visualize(&files[0], options, ctx),
        AudioBleep => audio::bleep(&files[0], options, ctx),
        AudioMetadata => audio::metadata(&files[0], options, ctx),
        AudioJoin => audio::join(files, options, ctx),
        ImageCompress => image::compress(&files[0], options, ctx),
        ImageResize => image::resize(&files[0], options, ctx),
        ImageCrop => image::crop(&files[0], options, ctx),
        ImageEdit => image::edit(&files[0], options, ctx),
        ImageBackground => image::background(&files[0], options, ctx),
        ImageRedact => image::redact(&files[0], options, ctx),
        ImageMetadata => image::metadata(&files[0], options, ctx),
        ImageCollage => image::collage(files, options, ctx),
        ImagePdf => image::make_pdf(files, options, ctx),
        PdfCompress => pdf::compress(&files[0], options, ctx),
        PdfMerge => pdf::merge(files, options, ctx),
        PdfSplit => pdf::split(&files[0], options, ctx),
        PdfOrganize => pdf::organize(&files[0], options, ctx),
        PdfImages => pdf::images(&files[0], options, ctx),
        PdfOcr => pdf::ocr(&files[0], options, ctx),
        PdfWord => pdf::word(&files[0], options, ctx),
        PdfMetadata => pdf::metadata(&files[0], options, ctx),
        SubtitleShift => subtitle::shift(&files[0], options, ctx),
    }
}

/// Apply the user's order (paths); anything not mentioned keeps its input position at the end.
pub fn order_files(files: &[FileInfo], order: &[String]) -> Vec<FileInfo> {
    if order.is_empty() {
        return files.to_vec();
    }
    let mut picked: Vec<FileInfo> = order.iter().filter_map(|p| files.iter().find(|f| &f.path == p).cloned()).collect();
    picked.extend(files.iter().filter(|f| !order.contains(&f.path)).cloned());
    picked
}

/// The UI's `tags` object as (key, value) pairs in the UI's order.
pub fn tag_pairs(tags: &serde_json::Map<String, Value>) -> Vec<(String, String)> {
    tags.iter()
        .map(|(k, v)| (k.clone(), match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        }))
        .collect()
}
