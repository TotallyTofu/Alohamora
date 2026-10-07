//! Encoders. JPEG = mozjpeg, PNG = image/png, WebP = libwebp, AVIF = rav1e (ravif), TIFF = LZW, BMP = image,
//! HEIC = Apple `sips` (macOS) or `heif-enc` (Windows/Linux) because no permissive Rust HEIC encoder exists.

use std::io::Cursor;
use std::path::Path;

use alohamora_core::types::Fmt;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder, RgbImage, RgbaImage};

use super::exif::{self, SourceMeta};
use crate::cancel::CancelToken;
use crate::paths::p2s;
use crate::process::run_process;
use crate::{AppError, Result};

/// Every format an image tool can write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveFmt { Jpg, Png, Webp, Avif, Tiff, Bmp, Heic }

impl SaveFmt {
    pub fn ext(self) -> &'static str {
        match self {
            SaveFmt::Jpg => "jpg",
            SaveFmt::Png => "png",
            SaveFmt::Webp => "webp",
            SaveFmt::Avif => "avif",
            SaveFmt::Tiff => "tiff",
            SaveFmt::Bmp => "bmp",
            SaveFmt::Heic => "heic",
        }
    }
}

/// Tools keep the input format when Alohamora can write it (port of `sameImageFmt`).
pub fn same_image_fmt(fmt: Option<Fmt>, heif_enc: bool) -> SaveFmt {
    match fmt {
        Some(Fmt::Jpg) => SaveFmt::Jpg,
        Some(Fmt::Png) => SaveFmt::Png,
        Some(Fmt::Webp) => SaveFmt::Webp,
        Some(Fmt::Avif) => SaveFmt::Avif,
        Some(Fmt::Tiff) => SaveFmt::Tiff,
        Some(Fmt::Bmp) => SaveFmt::Bmp,
        Some(Fmt::Heic) => if heif_enc { SaveFmt::Heic } else { SaveFmt::Jpg },
        _ => SaveFmt::Png, // svg and anything else
    }
}

fn encode_failed(e: impl std::fmt::Display) -> AppError {
    AppError::user_with("This image could not be converted. It may be damaged or too large.", e.to_string())
}

/// Paint transparent pixels onto a solid colour.
pub fn flatten(img: &DynamicImage, bg: [u8; 3]) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (o, p) in out.pixels_mut().zip(rgba.pixels()) {
        let a = p[3] as u32;
        for c in 0..3 {
            o[c] = ((p[c] as u32 * a + bg[c] as u32 * (255 - a) + 127) / 255) as u8;
        }
    }
    out
}

/// JPEG via mozjpeg (progressive, optimised like sharp's `mozjpeg: true`). White behind transparency.
pub fn jpeg_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let rgb = flatten(img, [255, 255, 255]);
    let (w, h) = (rgb.width() as usize, rgb.height() as usize);
    // libjpeg reports errors by panicking; catch_unwind turns that into an error.
    std::panic::catch_unwind(move || -> std::io::Result<Vec<u8>> {
        let mut c = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
        c.set_size(w, h);
        c.set_quality(quality.clamp(1.0, 100.0));
        let mut started = c.start_compress(Vec::new())?;
        started.write_scanlines(rgb.as_raw())?;
        started.finish()
    })
    .map_err(|_| encode_failed("JPEG encoder failed"))?
    .map_err(encode_failed)
}

/// Lossless PNG, maximum compression with adaptive filtering.
pub fn png_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Best, FilterType::Adaptive);
    let img = to_8bit(img);
    enc.write_image(img.as_bytes(), img.width(), img.height(), img.color().into()).map_err(encode_failed)?;
    Ok(out)
}

/// PNG with at most 256 colours (NeuQuant keeps transparency). `quality` 1–100 picks the colour count.
pub fn png_palette_bytes(img: &DynamicImage, quality: f64) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let colors = ((quality.clamp(1.0, 100.0) / 100.0) * 256.0).round().clamp(2.0, 256.0) as usize;
    let nq = color_quant::NeuQuant::new(10, colors, rgba.as_raw());
    let map = nq.color_map_rgba();
    let indexes: Vec<u8> = rgba.pixels().map(|p| nq.index_of(&p.0) as u8).collect();
    let mut palette = Vec::with_capacity(colors * 3);
    let mut trns = Vec::with_capacity(colors);
    for c in map.chunks_exact(4) {
        palette.extend_from_slice(&c[..3]);
        trns.push(c[3]);
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, rgba.width(), rgba.height());
        enc.set_color(png::ColorType::Indexed);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_palette(palette);
        if trns.iter().any(|&a| a != 255) {
            enc.set_trns(trns);
        }
        enc.set_compression(png::Compression::High);
        let mut writer = enc.write_header().map_err(encode_failed)?;
        writer.write_image_data(&indexes).map_err(encode_failed)?;
    }
    Ok(out)
}

pub fn webp_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let mem = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height()).encode(quality)
    } else {
        let rgb = img.to_rgb8();
        webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height()).encode(quality)
    };
    Ok(mem.to_vec())
}

/// AVIF quality is scaled by 0.65 like the Electron build (sharp's AVIF scale is harsher than JPEG's).
pub fn avif_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let pixels: Vec<ravif::RGBA8> = rgba.pixels().map(|p| ravif::RGBA8::new(p[0], p[1], p[2], p[3])).collect();
    let q = (quality * 0.65).round().clamp(1.0, 100.0);
    let encoded = ravif::Encoder::new()
        .with_quality(q)
        .with_alpha_quality(q)
        .with_speed(6)
        .encode_rgba(ravif::Img::new(pixels.as_slice(), rgba.width() as usize, rgba.height() as usize))
        .map_err(encode_failed)?;
    Ok(encoded.avif_file)
}

/// TIFF with LZW compression (RGBA, or RGB when the image has no alpha).
pub fn tiff_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    use tiff::encoder::{colortype, Compression, TiffEncoder};
    let mut out = Cursor::new(Vec::new());
    {
        let mut enc = TiffEncoder::new(&mut out).map_err(encode_failed)?.with_compression(Compression::Lzw);
        if img.color().has_alpha() {
            let rgba = img.to_rgba8();
            enc.write_image::<colortype::RGBA8>(rgba.width(), rgba.height(), rgba.as_raw()).map_err(encode_failed)?;
        } else {
            let rgb = img.to_rgb8();
            enc.write_image::<colortype::RGB8>(rgb.width(), rgb.height(), rgb.as_raw()).map_err(encode_failed)?;
        }
    }
    Ok(out.into_inner())
}

/// 24-bit BMP on white (same as FFmpeg's bgr24 output in the Electron build).
pub fn bmp_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    let rgb = flatten(img, [255, 255, 255]);
    let mut out = Cursor::new(Vec::new());
    rgb.write_to(&mut out, image::ImageFormat::Bmp).map_err(encode_failed)?;
    Ok(out.into_inner())
}

/// 16-bit images are written as 8-bit (PNG/WebP/JPEG encoders here are 8-bit).
fn to_8bit(img: &DynamicImage) -> DynamicImage {
    match img {
        DynamicImage::ImageLuma8(_) | DynamicImage::ImageLumaA8(_) | DynamicImage::ImageRgb8(_) | DynamicImage::ImageRgba8(_) => img.clone(),
        _ if img.color().has_alpha() => DynamicImage::ImageRgba8(img.to_rgba8()),
        _ => DynamicImage::ImageRgb8(img.to_rgb8()),
    }
}

/// Encode to any format except HEIC.
pub fn encode(img: &DynamicImage, fmt: SaveFmt, quality: f64) -> Result<Vec<u8>> {
    let q = quality as f32;
    match fmt {
        SaveFmt::Jpg => jpeg_bytes(img, q),
        SaveFmt::Png => png_bytes(img),
        SaveFmt::Webp => webp_bytes(img, q),
        SaveFmt::Avif => avif_bytes(img, q),
        SaveFmt::Tiff => tiff_bytes(img),
        SaveFmt::Bmp => bmp_bytes(img),
        SaveFmt::Heic => Err(AppError::other("HEIC is written by save_as")),
    }
}

/// Encode and write. `meta` = EXIF/ICC from the source to carry over (orientation reset to 1).
pub fn save_raster(img: &DynamicImage, fmt: SaveFmt, out: &Path, quality: f64, meta: Option<&SourceMeta>) -> Result<()> {
    let mut bytes = encode(img, fmt, quality)?;
    if let Some(m) = meta {
        bytes = exif::attach(bytes, fmt, m)?;
    }
    std::fs::write(out, bytes)?;
    Ok(())
}

/// Like `save_raster` but HEIC goes through the external encoder via a temporary PNG.
pub fn save_as(img: &DynamicImage, fmt: SaveFmt, out: &Path, quality: f64, scratch_png: &Path, cancel: &CancelToken, meta: Option<&SourceMeta>) -> Result<()> {
    if fmt == SaveFmt::Heic {
        std::fs::write(scratch_png, png_bytes(img)?)?;
        return encode_heic_file(scratch_png, out, quality, Some(cancel));
    }
    save_raster(img, fmt, out, quality, meta)
}

/// macOS: `sips -s format heic -s formatOptions <q> in.png --out out.heic`; elsewhere: `heif-enc -q <q> -o out.heic in.png`.
pub fn encode_heic_file(input_png: &Path, out: &Path, quality: f64, cancel: Option<&CancelToken>) -> Result<()> {
    let Some((kind, tool)) = crate::capabilities::heic_tool() else {
        return Err(AppError::user("HEIC output is not available on this computer."));
    };
    let q = alohamora_core::js::js_round(quality).clamp(1.0, 100.0).to_string();
    let args: Vec<String> = if kind == "sips" {
        vec!["-s".into(), "format".into(), "heic".into(), "-s".into(), "formatOptions".into(), q, p2s(input_png), "--out".into(), p2s(out)]
    } else {
        vec!["-q".into(), q, "-o".into(), p2s(out), p2s(input_png)]
    };
    run_process(&tool, &args, cancel, &kind)?;
    Ok(())
}

/// RGBA copy helper used by the compositing code.
pub fn rgba(img: &DynamicImage) -> RgbaImage {
    img.to_rgba8()
}
