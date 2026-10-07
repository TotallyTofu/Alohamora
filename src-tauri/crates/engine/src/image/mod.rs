//! Port of engines/image.ts (sharp/libvips replaced by the `image` crate and codec crates).
//! Everything works on `image::DynamicImage` that is already turned the right way up.

pub mod encode;
pub mod exif;
pub mod ops;
pub mod svg;

use std::path::Path;

use alohamora_core::registry;
use alohamora_core::options::{ImageCompressFormat, ImageCompressOptions};
use alohamora_core::types::{FileInfo, Fmt};
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::ffmpeg::run_ffmpeg_to_buffer;
use crate::paths::p2s;
use crate::{AppError, Result};

pub use encode::{same_image_fmt, save_as, save_raster, SaveFmt};

pub const MSG_UNREADABLE: &str = "Alohamora couldn't read this image. It may be damaged.";

/// SVGs are drawn at this many dots per inch when they are loaded as pictures (sharp used 300).
pub const SVG_DENSITY: f32 = 300.0;

pub fn unreadable(e: impl std::fmt::Display) -> AppError {
    AppError::user_with(MSG_UNREADABLE, e.to_string())
}

/// Load any supported image with EXIF orientation applied.
pub fn load(path: &Path, fmt: Option<Fmt>) -> Result<DynamicImage> {
    load_with_density(path, fmt, SVG_DENSITY)
}

/// Same as `load`, but SVGs are drawn at `svg_density` DPI (72 = the SVG's own pixel size).
pub fn load_with_density(path: &Path, fmt: Option<Fmt>, svg_density: f32) -> Result<DynamicImage> {
    match fmt {
        // HEIC and AVIF are decoded by the bundled FFmpeg (needs FFmpeg 7.1+ for iPhone grid images).
        Some(Fmt::Heic) | Some(Fmt::Avif) => decode_with_ffmpeg(path),
        Some(Fmt::Svg) => svg::render_file(path, svg_density / 72.0),
        _ => decode_oriented(path),
    }
}

fn decode_oriented(path: &Path) -> Result<DynamicImage> {
    let reader = ImageReader::open(path)?.with_guessed_format()?;
    let mut decoder = reader.into_decoder().map_err(unreadable)?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder).map_err(unreadable)?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn decode_with_ffmpeg(path: &Path) -> Result<DynamicImage> {
    let args: Vec<String> = ["-i", &p2s(path), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"]
        .iter().map(|s| s.to_string()).collect();
    let png = run_ffmpeg_to_buffer(&args, None).map_err(unreadable)?;
    image::load_from_memory_with_format(&png, image::ImageFormat::Png).map_err(unreadable)
}

fn swaps_sides(o: Orientation) -> bool {
    matches!(o, Orientation::Rotate90 | Orientation::Rotate270 | Orientation::Rotate90FlipH | Orientation::Rotate270FlipH)
}

/// Display size after orientation. Reads only the header for normal raster files.
pub fn display_size(path: &Path, fmt: Option<Fmt>) -> Result<(u32, u32)> {
    match fmt {
        Some(Fmt::Svg) => svg::size(path, SVG_DENSITY / 72.0),
        Some(Fmt::Heic) | Some(Fmt::Avif) => {
            let img = load(path, fmt)?;
            Ok((img.width(), img.height()))
        }
        _ => {
            let mut decoder = ImageReader::open(path)?.with_guessed_format()?.into_decoder().map_err(unreadable)?;
            let (w, h) = decoder.dimensions();
            let o = decoder.orientation().unwrap_or(Orientation::NoTransforms);
            Ok(if swaps_sides(o) { (h, w) } else { (w, h) })
        }
    }
}

/// Scale down (never up unless `enlarge`) so the image fits inside `max_w` × `max_h`, keeping its shape.
pub fn fit_inside(img: DynamicImage, max_w: u32, max_h: u32, enlarge: bool) -> DynamicImage {
    if !enlarge && img.width() <= max_w && img.height() <= max_h {
        return img;
    }
    img.resize(max_w, max_h, image::imageops::FilterType::Lanczos3)
}

/// 256 px JPEG thumbnail for the file list (white behind transparent pixels).
pub fn thumbnail_jpeg(path: &Path, fmt: Option<Fmt>, size: u32) -> Result<Vec<u8>> {
    let img = load_with_density(path, fmt, 72.0)?;
    encode::jpeg_bytes(&img.thumbnail(size, size), 70.0)
}

/// Audio cover art: at most 1000 px, white background, JPEG quality 90.
pub fn cover_art_jpeg(src: &Path, out: &Path) -> Result<()> {
    let img = load(src, registry::fmt_from_path(&p2s(src)))?;
    std::fs::write(out, encode::jpeg_bytes(&fit_inside(img, 1000, 1000, false), 90.0)?)?;
    Ok(())
}

/// Output format of image.compress: "keep" keeps JPG/PNG/WebP/AVIF, everything else becomes JPG.
pub fn compress_fmt(file: &FileInfo, o: &ImageCompressOptions) -> SaveFmt {
    match o.format {
        ImageCompressFormat::Jpg => SaveFmt::Jpg,
        ImageCompressFormat::Webp => SaveFmt::Webp,
        ImageCompressFormat::Avif => SaveFmt::Avif,
        ImageCompressFormat::Keep => match file.fmt {
            Some(Fmt::Png) => SaveFmt::Png,
            Some(Fmt::Webp) => SaveFmt::Webp,
            Some(Fmt::Avif) => SaveFmt::Avif,
            _ => SaveFmt::Jpg,
        },
    }
}

/// Encoded bytes for image.compress (also used by the compress preview).
pub fn compress_to_bytes(file: &FileInfo, o: &ImageCompressOptions) -> Result<(Vec<u8>, SaveFmt)> {
    let fmt = compress_fmt(file, o);
    let path = Path::new(&file.path);
    let mut img = load(path, file.fmt)?;
    if o.max_side > 0.0 {
        let m = o.max_side as u32;
        img = fit_inside(img, m, m, false);
    }
    let bytes = match fmt {
        SaveFmt::Png => encode::png_palette_bytes(&img, o.quality)?,
        other => encode::encode(&img, other, o.quality)?,
    };
    let bytes = if o.strip_metadata { bytes } else { exif::attach(bytes, fmt, &exif::read_source_meta(path))? };
    Ok((bytes, fmt))
}
