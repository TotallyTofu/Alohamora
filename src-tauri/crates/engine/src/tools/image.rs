//! Port of src/main/tools/image/*.ts.

use std::path::Path;

use alohamora_core::edit_pipeline::build_edit_spec;
use alohamora_core::geometry::{clamp_norm_rect, is_full_rect, to_pixel_rect};
use alohamora_core::js::{js_num, js_round};
use alohamora_core::options::*;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use image::DynamicImage;
use serde_json::Value;

use super::order_files;
use crate::image::encode::{self, same_image_fmt, save_as, save_raster, SaveFmt};
use crate::image::exif::{self, read_source_meta, EditFields};
use crate::image::{load, ops};
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

fn src(file: &FileInfo) -> &Path {
    Path::new(&file.path)
}

/// Save in the input's own format (port of saveImageAs). `keep_meta` carries EXIF/ICC over.
fn save_same(img: &DynamicImage, file: &FileInfo, suffix: &str, quality: f64, ctx: &JobContext, keep_meta: bool) -> Result<SaveFmt> {
    let fmt = same_image_fmt(file.fmt, ctx.caps.heif_enc);
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix(suffix));
    let meta = if keep_meta { Some(read_source_meta(src(file))) } else { None };
    save_as(img, fmt, &out, quality, &ctx.temp_path("heic.png"), &ctx.cancel, meta.as_ref())?;
    Ok(fmt)
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageCompressOptions = with_defaults(ToolId::ImageCompress, options);
    let fmt = crate::image::compress_fmt(file, &o);
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix("compressed"));
    let (bytes, _) = crate::image::compress_to_bytes(file, &o)?;
    if bytes.len() as u64 >= file.size {
        ctx.drop_output(&out);
        ctx.note(format!("{} is already small", file.name));
        return Ok(());
    }
    std::fs::write(&out, &bytes)?;
    let saved = js_round((1.0 - bytes.len() as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(bytes.len() as u64), js_num(saved)));
    Ok(())
}

pub fn resize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageResizeOptions = with_defaults(ToolId::ImageResize, options);
    let img = load(src(file), file.fmt)?;
    let (sw, sh) = (img.width() as f64, img.height() as f64);
    let (w, h): (Option<f64>, Option<f64>);
    let mut fill = false;
    if o.mode == ResizeMode::Percent {
        if o.percent.is_nan() || o.percent <= 0.0 {
            return Err(AppError::user("Choose a size above 0 %."));
        }
        w = Some(js_round(sw * o.percent / 100.0).max(1.0));
        h = Some(js_round(sh * o.percent / 100.0).max(1.0));
    } else {
        w = if o.width > 0.0 { Some(js_round(o.width)) } else { None };
        h = if o.height > 0.0 { Some(js_round(o.height)) } else { None };
        if w.is_none() && h.is_none() {
            return Err(AppError::user("Enter a width or a height."));
        }
        if !o.keep_aspect && w.is_some() && h.is_some() {
            fill = true;
        }
    }
    // sharp: one side given → the other follows the aspect ratio; both given + keep aspect → fit inside.
    let resized = match (w, h) {
        (Some(w), Some(h)) if fill => img.resize_exact(w as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (Some(w), Some(h)) => img.resize(w as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (Some(w), None) => img.resize_exact(w as u32, js_round(w * sh / sw).max(1.0) as u32, image::imageops::FilterType::Lanczos3),
        (None, Some(h)) => img.resize_exact(js_round(h * sw / sh).max(1.0) as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (None, None) => img,
    };
    save_same(&resized, file, "resized", ctx.settings.image_quality.max(90.0), ctx, true)?;
    let show = |v: Option<f64>| v.map(js_num).unwrap_or_else(|| "?".into());
    ctx.note(format!("{}×{} → {}×{}", js_num(sw), js_num(sh), show(w), show(h)));
    Ok(())
}

pub fn crop(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageCropOptions = with_defaults(ToolId::ImageCrop, options);
    let mut img = load(src(file), file.fmt)?;
    img = match (js_round(o.rotate) as i64).rem_euclid(360) {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };
    if o.flip_v {
        img = img.flipv();
    }
    if o.flip_h {
        img = img.fliph();
    }
    if !is_full_rect(o.rect) {
        let r = to_pixel_rect(clamp_norm_rect(o.rect), img.width(), img.height(), false);
        img = img.crop_imm(r.x, r.y, r.w, r.h);
    }
    save_same(&img, file, "cropped", ctx.settings.image_quality.max(92.0), ctx, true)?;
    Ok(())
}

pub fn edit(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: EditParams = with_defaults(ToolId::ImageEdit, options);
    let img = load(src(file), file.fmt)?;
    let edited = ops::apply_edit(&img, &build_edit_spec(&o));
    save_same(&edited, file, "edited", ctx.settings.image_quality.max(92.0), ctx, true)?;
    Ok(())
}

pub fn background(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageBackgroundOptions = with_defaults(ToolId::ImageBackground, options);
    let img = load(src(file), file.fmt)?;
    let composed = DynamicImage::ImageRgba8(ops::compose_background(&img, &o)?);
    let fmt = if file.fmt == Some(Fmt::Jpg) { SaveFmt::Jpg } else { SaveFmt::Png };
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix("backdrop"));
    save_raster(&composed, fmt, &out, ctx.settings.image_quality.max(92.0), None)
}

pub fn redact(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageRedactOptions = with_defaults(ToolId::ImageRedact, options);
    if o.regions.is_empty() {
        return Err(AppError::user("Draw at least one box over the area to hide."));
    }
    let img = load(src(file), file.fmt)?;
    let had_alpha = img.color().has_alpha();
    let out = DynamicImage::ImageRgba8(ops::redact(&img, &o.regions));
    let out = if had_alpha { out } else { DynamicImage::ImageRgb8(out.to_rgb8()) };
    save_same(&out, file, "redacted", 92.0, ctx, false)?;
    ctx.note("Metadata removed");
    Ok(())
}

/// "2024-05-01T14:30" (datetime-local) → "2024:05:01 14:30:00" (EXIF). Anything else is returned unchanged.
pub fn to_exif_date(v: Option<&str>) -> Option<String> {
    let v = v.filter(|s| !s.is_empty())?;
    let re = regex::Regex::new(r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?").expect("valid regex");
    Some(match re.captures(v) {
        Some(c) => format!("{}:{}:{} {}:{}:{}", &c[1], &c[2], &c[3], &c[4], &c[5], c.get(6).map(|m| m.as_str()).unwrap_or("00")),
        None => v.to_string(),
    })
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageMetadataOptions = with_defaults(ToolId::ImageMetadata, options);
    let fmt = same_image_fmt(file.fmt, ctx.caps.heif_enc);
    let suffix = match o.action {
        ImageMetadataAction::RemoveAll => "clean",
        ImageMetadataAction::RemoveGps => "nogps",
        ImageMetadataAction::Edit => "meta",
    };
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix(suffix));
    let bytes = std::fs::read(src(file))?;
    let bad = |e: String| AppError::user_with(crate::image::MSG_UNREADABLE, e);

    if o.action == ImageMetadataAction::RemoveAll {
        // JPEGs with an orientation tag are re-encoded upright; stripping the tag losslessly would turn them.
        if file.fmt == Some(Fmt::Jpg) && exif::orientation(src(file)) == 1 {
            std::fs::write(&out, alohamora_core::image_meta::strip_jpeg_metadata(&bytes, true).map_err(bad)?)?;
        } else if file.fmt == Some(Fmt::Png) {
            std::fs::write(&out, alohamora_core::image_meta::strip_png_metadata(&bytes).map_err(bad)?)?;
        } else {
            save_as(&load(src(file), file.fmt)?, fmt, &out, 95.0, &ctx.temp_path("heic.png"), &ctx.cancel, None)?;
        }
        ctx.note("Metadata removed");
        return Ok(());
    }

    if file.fmt == Some(Fmt::Jpg) {
        let new_bytes = if o.action == ImageMetadataAction::RemoveGps {
            exif::jpeg_remove_gps(&bytes)?
        } else {
            let f = &o.fields;
            exif::jpeg_edit_fields(&bytes, &EditFields {
                artist: f.artist.clone(),
                copyright: f.copyright.clone(),
                description: f.description.clone(),
                date_taken: to_exif_date(f.date_taken.as_deref()),
            })?
        };
        std::fs::write(&out, new_bytes)?;
    } else {
        // Other formats: re-encode, carrying over (or replacing) only the text fields — never the location.
        let (a0, c0, d0) = exif::text_fields(src(file));
        let edit = o.action == ImageMetadataAction::Edit;
        let pick = |new: &Option<String>, old: String| if edit { new.clone().unwrap_or(old) } else { old };
        let artist = pick(&o.fields.artist, a0);
        let copyright = pick(&o.fields.copyright, c0);
        let description = pick(&o.fields.description, d0);
        let meta = exif::SourceMeta { exif: exif::text_only_exif(&artist, &copyright, &description)?, icc: None };
        save_as(&load(src(file), file.fmt)?, fmt, &out, 95.0, &ctx.temp_path("heic.png"), &ctx.cancel, Some(&meta))?;
    }
    ctx.note(if o.action == ImageMetadataAction::RemoveGps { "Location removed" } else { "Metadata updated" });
    Ok(())
}

pub fn collage(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: CollageOptions = with_defaults(ToolId::ImageCollage, options);
    let ordered = order_files(files, &o.order);
    let canvas = ops::compose_collage(&ordered, &o, o.width, Some(&ctx.cancel))?;
    let bg = ops::parse_color(&o.background);
    let flat = DynamicImage::ImageRgb8(encode::flatten(&DynamicImage::ImageRgba8(canvas), [bg[0], bg[1], bg[2]]));
    let out = ctx.new_output(OutputSpec::new(&ordered[0].path, "jpg").suffix("collage"));
    std::fs::write(out, encode::jpeg_bytes(&flat, 90.0)?)?;
    ctx.note(format!("{} images", ordered.len()));
    Ok(())
}

pub fn make_pdf(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: CreatePdfOptions = with_defaults(ToolId::ImagePdf, options);
    let ordered = order_files(files, &o.order);
    if o.combine {
        let out = ctx.new_output(OutputSpec::new(&ordered[0].path, "pdf"));
        crate::pdf::create::images_to_pdf(&ordered, o.page_size, o.margin, &out, &|p| ctx.progress(p, None), &ctx.cancel)?;
        ctx.note(format!("{} page{}", ordered.len(), if ordered.len() == 1 { "" } else { "s" }));
        return Ok(());
    }
    let n = ordered.len() as f64;
    for (i, f) in ordered.iter().enumerate() {
        let out = ctx.new_output(OutputSpec::new(&f.path, "pdf"));
        crate::pdf::create::images_to_pdf(std::slice::from_ref(f), o.page_size, o.margin, &out, &|p| ctx.progress((i as f64 + p) / n, None), &ctx.cancel)?;
    }
    ctx.note(format!("{} PDFs", ordered.len()));
    Ok(())
}
