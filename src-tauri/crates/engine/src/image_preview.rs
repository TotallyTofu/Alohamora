//! Port of imagePreview.ts: live previews for the image tools, made by the SAME functions as the export.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use alohamora_core::edit_pipeline::build_edit_spec;
use alohamora_core::options::*;
use alohamora_core::types::{ImagePreviewRequest, ImagePreviewResult, ToolId};
use image::DynamicImage;
use serde_json::Value;

use crate::fsutil::data_url;
use crate::image::{encode, fit_inside, load_with_density, ops};
use crate::inspect::inspect_basic;
use crate::Result;

/// Decoded, upright, downscaled picture; the last 6 are kept.
fn proxy(path: &str, max_side: u32) -> Result<DynamicImage> {
    static CACHE: OnceLock<Mutex<VecDeque<(String, DynamicImage)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(VecDeque::new()));
    let key = format!("{path}|{max_side}");
    if let Some((_, img)) = cache.lock().expect("proxy cache").iter().find(|(k, _)| *k == key) {
        return Ok(img.clone());
    }
    let info = inspect_basic(path);
    let img = fit_inside(load_with_density(Path::new(path), info.fmt, 144.0)?, max_side, max_side, false);
    let mut c = cache.lock().expect("proxy cache");
    if c.len() >= 6 {
        c.pop_front();
    }
    c.push_back((key, img.clone()));
    Ok(img)
}

fn to_result(img: &DynamicImage, bytes: Option<u64>, original_bytes: Option<u64>) -> Result<ImagePreviewResult> {
    Ok(ImagePreviewResult { data_url: data_url("image/png", &encode::png_bytes(img)?), width: img.width(), height: img.height(), bytes, original_bytes })
}

fn options(req: &ImagePreviewRequest) -> Value {
    req.options.clone().unwrap_or(Value::Object(Default::default()))
}

pub fn preview_image(req: &ImagePreviewRequest) -> Result<ImagePreviewResult> {
    let max = req.max_side.max(1.0) as u32;
    let base = proxy(&req.path, max)?;
    match req.op.as_str() {
        "compress" => {
            let o: ImageCompressOptions = with_defaults(ToolId::ImageCompress, &options(req));
            // Full resolution → the real output size; the picture shown is scaled down again.
            let (bytes, _) = crate::image::compress_to_bytes(&inspect_basic(&req.path), &o)?;
            let original = std::fs::metadata(&req.path)?.len();
            let shown = image::load_from_memory(&bytes).map_err(crate::image::unreadable)?;
            to_result(&fit_inside(shown, max, max, false), Some(bytes.len() as u64), Some(original))
        }
        "crop" => {
            let o: ImageCropOptions = with_defaults(ToolId::ImageCrop, &options(req));
            let mut img = match (alohamora_core::js::js_round(o.rotate) as i64).rem_euclid(360) {
                90 => base.rotate90(),
                180 => base.rotate180(),
                270 => base.rotate270(),
                _ => base,
            };
            if o.flip_v { img = img.flipv(); }
            if o.flip_h { img = img.fliph(); }
            to_result(&img, None, None)
        }
        "edit" => {
            // Missing keys fall back to DEFAULT_EDIT (same as `{ ...DEFAULT_EDIT, ...options }`).
            let params: EditParams = with_defaults(ToolId::ImageEdit, &options(req));
            to_result(&ops::apply_edit(&base, &build_edit_spec(&params)), None, None)
        }
        "background" => {
            let o: ImageBackgroundOptions = with_defaults(ToolId::ImageBackground, &options(req));
            to_result(&DynamicImage::ImageRgba8(ops::compose_background(&base, &o)?), None, None)
        }
        "collage" => {
            let o: CollageOptions = with_defaults(ToolId::ImageCollage, &options(req));
            let paths = req.paths.clone().filter(|p| !p.is_empty()).unwrap_or_else(|| vec![req.path.clone()]);
            let ordered: Vec<String> = if o.order.is_empty() { paths } else { o.order.iter().filter(|p| paths.contains(p)).cloned().collect() };
            let files: Vec<_> = ordered.iter().map(|p| inspect_basic(p)).collect();
            to_result(&DynamicImage::ImageRgba8(ops::compose_collage(&files, &o, 800.0, None)?), None, None)
        }
        _ => to_result(&base, None, None),
    }
}
