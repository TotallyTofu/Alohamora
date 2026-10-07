//! Pixel operations: edit pipeline, backdrop, collage, redaction (ports of imageEdit.ts, imageBackground.ts,
//! imageCollage.ts and tools/image/redact.ts). Everything works on straight-alpha RGBA8.

use alohamora_core::collage_layout::collage_cells;
use alohamora_core::edit_pipeline::{EditSpec, M3};
use alohamora_core::geometry::{clamp_norm_rect, to_pixel_rect};
use alohamora_core::options::{BackgroundKind, CollageFit, CollageOptions, ImageBackgroundOptions, ImageRedactRegion, RedactStyle};
use alohamora_core::types::FileInfo;
use image::imageops::{self, FilterType};
use image::{DynamicImage, Rgba, RgbaImage};

use super::svg::render_str;
use crate::cancel::CancelToken;
use crate::Result;

/// "#rgb", "#rrggbb" or "#rrggbbaa". Anything else is white.
pub fn parse_color(s: &str) -> [u8; 4] {
    let h = s.trim().trim_start_matches('#');
    let hex = |i: usize, n: usize| u8::from_str_radix(&h[i..i + n], 16).ok();
    let v = match h.len() {
        3 => (|| Some([hex(0, 1)? * 17, hex(1, 1)? * 17, hex(2, 1)? * 17, 255]))(),
        6 => (|| Some([hex(0, 2)?, hex(2, 2)?, hex(4, 2)?, 255]))(),
        8 => (|| Some([hex(0, 2)?, hex(2, 2)?, hex(4, 2)?, hex(6, 2)?]))(),
        _ => None,
    };
    v.unwrap_or([255, 255, 255, 255])
}

// ---------- edit pipeline ----------

fn srgb_to_linear(v: f64) -> f64 {
    let v = (v / 255.0).clamp(0.0, 1.0);
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

fn linear_to_srgb(v: f64) -> f64 {
    let v = v.clamp(0.0, 1.0);
    255.0 * if v <= 0.003_130_8 { v * 12.92 } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
}

/// Saturation multiplier and hue rotation (degrees) in Oklch. sharp used CIE LCh; this is close and stable.
fn modulate(c: [f64; 3], saturation: f64, hue_deg: f64) -> [f64; 3] {
    let (r, g, b) = (srgb_to_linear(c[0]), srgb_to_linear(c[1]), srgb_to_linear(c[2]));
    let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
    let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
    let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
    let ll = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
    let a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
    let bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
    let (sin, cos) = hue_deg.to_radians().sin_cos();
    let a2 = (a * cos - bb * sin) * saturation;
    let b2 = (a * sin + bb * cos) * saturation;
    let l_ = ll + 0.396_337_777_4 * a2 + 0.215_803_757_3 * b2;
    let m_ = ll - 0.105_561_345_8 * a2 - 0.063_854_172_8 * b2;
    let s_ = ll - 0.089_484_177_5 * a2 - 1.291_485_548 * b2;
    let (l3, m3, s3) = (l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
    [
        linear_to_srgb(4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3),
        linear_to_srgb(-1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3),
        linear_to_srgb(-0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3),
    ]
}

fn recomb(m: &M3, c: [f64; 3]) -> [f64; 3] {
    [
        m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
        m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
        m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2],
    ]
}

/// Darken the edges: elliptical radial gradient, white up to 55 % of the radius, then down to k/255 at 100 %.
fn vignette(px: &mut RgbaImage, strength: f64) {
    let (w, h) = (px.width() as f64, px.height() as f64);
    let k = (255.0 * (1.0 - 0.75 * strength)).round() / 255.0;
    for (x, y, p) in px.enumerate_pixels_mut() {
        let dx = (x as f64 + 0.5 - w / 2.0) / (0.75 * w);
        let dy = (y as f64 + 0.5 - h / 2.0) / (0.75 * h);
        let d = (dx * dx + dy * dy).sqrt();
        let f = if d <= 0.55 { 1.0 } else if d >= 1.0 { k } else { 1.0 + (k - 1.0) * (d - 0.55) / 0.45 };
        for c in 0..3 {
            p[c] = (p[c] as f64 * f).round().clamp(0.0, 255.0) as u8;
        }
    }
}

/// Copy alpha from `src` into `dst` (keeps transparency when an operation should not touch it).
fn restore_alpha(dst: &mut RgbaImage, src: &RgbaImage) {
    for (d, s) in dst.pixels_mut().zip(src.pixels()) {
        d[3] = s[3];
    }
}

/// The same function serves previews and the final export, so previews match the output.
pub fn apply_edit(img: &DynamicImage, spec: &EditSpec) -> DynamicImage {
    let had_alpha = img.color().has_alpha();
    let mut px = img.to_rgba8();
    for p in px.pixels_mut() {
        let mut c = [p[0] as f64, p[1] as f64, p[2] as f64];
        if let Some((a, b)) = spec.linear {
            c = c.map(|v| (v * a + b).clamp(0.0, 255.0));
        }
        if let Some((sat, hue)) = spec.modulate {
            c = modulate(c, sat, hue);
        }
        if let Some(m) = &spec.recomb {
            c = recomb(m, c).map(|v| v.clamp(0.0, 255.0));
        }
        if spec.grayscale {
            let y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            c = [y, y, y];
        }
        if spec.negate {
            c = c.map(|v| 255.0 - v);
        }
        for i in 0..3 {
            p[i] = c[i].round().clamp(0.0, 255.0) as u8;
        }
    }
    if let Some(sigma) = spec.sharpen_sigma {
        let before = px.clone();
        px = imageops::unsharpen(&px, sigma as f32, 0);
        restore_alpha(&mut px, &before);
    }
    if let Some(sigma) = spec.blur_sigma {
        px = imageops::fast_blur(&px, sigma as f32);
    }
    if spec.vignette > 0.0 {
        vignette(&mut px, spec.vignette);
    }
    if had_alpha { DynamicImage::ImageRgba8(px) } else { DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(px).to_rgb8()) }
}

// ---------- masks and compositing ----------

/// White rounded rectangle on transparent (same SVG as the Electron build).
pub fn rounded_mask(w: u32, h: u32, r: u32) -> Result<RgbaImage> {
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\"><rect width=\"100%\" height=\"100%\" rx=\"{r}\" ry=\"{r}\" fill=\"#fff\"/></svg>"
    ))
}

/// "dest-in": keep `img` only where `mask` is opaque.
pub fn mask_alpha(img: &mut RgbaImage, mask: &RgbaImage) {
    for (p, m) in img.pixels_mut().zip(mask.pixels()) {
        p[3] = ((p[3] as u32 * m[3] as u32 + 127) / 255) as u8;
    }
}

fn gradient(w: u32, h: u32, c1: &str, c2: &str, angle: f64) -> Result<RgbaImage> {
    let rot = alohamora_core::js::js_num(angle - 90.0);
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\"><defs><linearGradient id=\"g\" gradientTransform=\"rotate({rot} .5 .5)\"><stop offset=\"0\" stop-color=\"{c1}\"/><stop offset=\"1\" stop-color=\"{c2}\"/></linearGradient></defs><rect width=\"100%\" height=\"100%\" fill=\"url(#g)\"/></svg>"
    ))
}

fn shadow(big_w: u32, big_h: u32, x: i64, y: i64, w: u32, h: u32, r: u32) -> Result<RgbaImage> {
    let blur = ((w.min(h) as f64 * 0.03).round() as i64).max(6);
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{big_w}\" height=\"{big_h}\"><defs><filter id=\"s\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"{blur}\"/></filter></defs><rect x=\"{x}\" y=\"{}\" width=\"{w}\" height=\"{h}\" rx=\"{r}\" fill=\"rgba(0,0,0,0.35)\" filter=\"url(#s)\"/></svg>",
        y + blur
    ))
}

fn ratio(aspect: &str) -> Option<f64> {
    match aspect {
        "1:1" => Some(1.0),
        "4:5" => Some(4.0 / 5.0),
        "16:9" => Some(16.0 / 9.0),
        "9:16" => Some(9.0 / 16.0),
        _ => None,
    }
}

fn js_round_u32(v: f64) -> u32 {
    alohamora_core::js::js_round(v).max(0.0) as u32
}

/// Port of composeBackground: picture on a padded solid/gradient/blurred backdrop, optional round corners and shadow.
pub fn compose_background(src: &DynamicImage, o: &ImageBackgroundOptions) -> Result<RgbaImage> {
    let fg_src = src.to_rgba8();
    let (w, h) = fg_src.dimensions();
    let pad = js_round_u32(w.max(h) as f64 * o.padding_pct / 100.0);
    let mut big_w = w + 2 * pad;
    let mut big_h = h + 2 * pad;
    if let Some(r) = ratio(&o.aspect) {
        if big_w as f64 / big_h as f64 > r { big_h = js_round_u32(big_w as f64 / r) } else { big_w = js_round_u32(big_h as f64 * r) }
    }
    let radius = js_round_u32(w.min(h) as f64 * o.radius_pct / 100.0);
    let mut fg = fg_src.clone();
    if radius > 0 {
        mask_alpha(&mut fg, &rounded_mask(w, h, radius)?);
    }
    let mut bg: RgbaImage = match o.kind {
        BackgroundKind::Solid => RgbaImage::from_pixel(big_w, big_h, Rgba(parse_color(&o.color))),
        BackgroundKind::Gradient => gradient(big_w, big_h, &o.gradient.0, &o.gradient.1, o.angle)?,
        _ => {
            let filled = DynamicImage::ImageRgba8(fg_src).resize_to_fill(big_w, big_h, FilterType::Triangle);
            let mut b = filled.fast_blur((big_w as f32 / 40.0).round().max(20.0)).to_rgba8();
            for p in b.pixels_mut() {
                for c in 0..3 {
                    p[c] = (p[c] as f64 * 0.9).round() as u8;
                }
            }
            b
        }
    };
    let left = js_round_u32((big_w - w) as f64 / 2.0) as i64;
    let top = js_round_u32((big_h - h) as f64 / 2.0) as i64;
    if o.shadow {
        imageops::overlay(&mut bg, &shadow(big_w, big_h, left, top, w, h, radius)?, 0, 0);
    }
    imageops::overlay(&mut bg, &fg, left, top);
    Ok(bg)
}

/// Fill the box and cut off the overflow (centre crop; sharp used "attention" — documented gap).
pub fn resize_cover(img: &DynamicImage, w: u32, h: u32) -> RgbaImage {
    img.resize_to_fill(w, h, FilterType::Lanczos3).to_rgba8()
}

/// Fit inside the box and pad with `bg`.
pub fn resize_contain(img: &DynamicImage, w: u32, h: u32, bg: [u8; 4]) -> RgbaImage {
    let fitted = img.resize(w, h, FilterType::Lanczos3).to_rgba8();
    let mut canvas = RgbaImage::from_pixel(w, h, Rgba(bg));
    let x = (w as i64 - fitted.width() as i64) / 2;
    let y = (h as i64 - fitted.height() as i64) / 2;
    imageops::overlay(&mut canvas, &fitted, x, y);
    canvas
}

/// Port of composeCollage. Sequential on purpose (keeps memory low). `width` overrides o.width (previews use 800).
pub fn compose_collage(files: &[FileInfo], o: &CollageOptions, width: f64, cancel: Option<&CancelToken>) -> Result<RgbaImage> {
    let layout = collage_cells(files.len(), o.layout, width, o.gap);
    let bg = parse_color(&o.background);
    let mut canvas = RgbaImage::from_pixel(layout.width, layout.height, Rgba(bg));
    for (file, c) in files.iter().zip(layout.cells.iter()) {
        if let Some(t) = cancel {
            t.check()?;
        }
        let w = js_round_u32(c.w).max(1);
        let h = js_round_u32(c.h).max(1);
        let img = super::load(std::path::Path::new(&file.path), file.fmt)?;
        let mut tile = match o.fit {
            CollageFit::Cover => resize_cover(&img, w, h),
            CollageFit::Contain => resize_contain(&img, w, h, bg),
        };
        if o.radius > 0.0 {
            let r = js_round_u32(w.min(h) as f64 * o.radius / 100.0);
            mask_alpha(&mut tile, &rounded_mask(w, h, r)?);
        }
        imageops::overlay(&mut canvas, &tile, alohamora_core::js::js_round(c.x) as i64, alohamora_core::js::js_round(c.y) as i64);
    }
    Ok(canvas)
}

/// Port of runImageRedact's pixel work: black box, strong blur, or 16 px pixelation per region.
pub fn redact(img: &DynamicImage, regions: &[ImageRedactRegion]) -> RgbaImage {
    let mut base = img.to_rgba8();
    let source = base.clone();
    let (iw, ih) = base.dimensions();
    for reg in regions {
        let r = to_pixel_rect(clamp_norm_rect(reg.rect), iw, ih, false);
        let region = imageops::crop_imm(&source, r.x, r.y, r.w, r.h).to_image();
        let patch: RgbaImage = match reg.style {
            RedactStyle::Black => RgbaImage::from_pixel(r.w, r.h, Rgba([0, 0, 0, 255])),
            RedactStyle::Blur => imageops::fast_blur(&region, (r.w.min(r.h) as f32 / 6.0).max(12.0)),
            _ => {
                let small = imageops::resize(&region, r.w.div_ceil(16).max(1), r.h.div_ceil(16).max(1), FilterType::Nearest);
                imageops::resize(&small, r.w, r.h, FilterType::Nearest)
            }
        };
        imageops::replace(&mut base, &patch, r.x as i64, r.y as i64);
    }
    base
}
