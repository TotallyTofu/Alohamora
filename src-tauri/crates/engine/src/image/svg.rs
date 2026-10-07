//! SVG in (resvg) and SVG out (vtracer trace or an embedded PNG). Port of engines/svg.ts.

use std::path::Path;
use std::sync::{Arc, OnceLock};

use base64::Engine as _;
use image::{DynamicImage, RgbaImage};
use resvg::{tiny_skia, usvg};

use crate::{AppError, Result};

/// Largest picture we draw from an SVG (pixels). Bigger requests are scaled down to this.
const MAX_PIXELS: f64 = 100_000_000.0;

/// System fonts plus the bundled fonts, loaded once (SVG <text> needs them).
fn fontdb() -> Arc<usvg::fontdb::Database> {
    static DB: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_system_fonts();
        db.load_fonts_dir(crate::paths::fonts_dir());
        Arc::new(db)
    })
    .clone()
}

fn parse(data: &[u8]) -> Result<usvg::Tree> {
    let opt = usvg::Options { fontdb: fontdb(), ..Default::default() };
    usvg::Tree::from_data(data, &opt).map_err(super::unreadable)
}

fn draw(tree: &usvg::Tree, scale: f32) -> Result<RgbaImage> {
    let size = tree.size();
    let mut s = scale;
    let px = (size.width() * s) as f64 * (size.height() * s) as f64;
    if px > MAX_PIXELS {
        s *= (MAX_PIXELS / px).sqrt() as f32;
    }
    let w = ((size.width() * s).ceil() as u32).max(1);
    let h = ((size.height() * s).ceil() as u32).max(1);
    let mut pixmap = tiny_skia::Pixmap::new(w, h).ok_or_else(|| AppError::user("This SVG is too large to draw."))?;
    resvg::render(tree, tiny_skia::Transform::from_scale(s, s), &mut pixmap.as_mut());
    RgbaImage::from_raw(w, h, pixmap.take_demultiplied()).ok_or_else(|| AppError::other("SVG buffer size mismatch"))
}

/// Draw an SVG file. `scale` 1.0 = the SVG's own pixel size (sharp density 72).
pub fn render_file(path: &Path, scale: f32) -> Result<DynamicImage> {
    let tree = parse(&std::fs::read(path)?)?;
    Ok(DynamicImage::ImageRgba8(draw(&tree, scale)?))
}

/// Size the file would have when drawn at `scale`.
pub fn size(path: &Path, scale: f32) -> Result<(u32, u32)> {
    let tree = parse(&std::fs::read(path)?)?;
    let s = tree.size();
    Ok((((s.width() * scale).ceil() as u32).max(1), ((s.height() * scale).ceil() as u32).max(1)))
}

/// Draw SVG markup we generate ourselves (gradients, masks, shadows) at its own size.
pub fn render_str(svg: &str) -> Result<RgbaImage> {
    draw(&parse(svg.as_bytes())?, 1.0)
}

/// `<svg>` that only wraps the picture as a PNG data URL.
pub fn embed(img: &DynamicImage) -> Result<String> {
    let png = super::encode::png_bytes(img)?;
    let (w, h) = (img.width(), img.height());
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\" viewBox=\"0 0 {w} {h}\"><image width=\"{w}\" height=\"{h}\" href=\"data:image/png;base64,{b64}\"/></svg>"
    ))
}

/// Vectorise: shrink to ≤1000 px, trace colour regions into paths. `colors` (2–64) maps to vtracer's colour precision.
pub fn trace(img: &DynamicImage, colors: f64) -> Result<String> {
    let small = super::fit_inside(img.clone(), 1000, 1000, false).to_rgba8();
    let (w, h) = (small.width() as usize, small.height() as usize);
    let precision = (colors.max(2.0).log2().ceil() as i32 + 2).clamp(1, 8);
    let config = vtracer::Config { color_precision: precision, filter_speckle: 8, ..Default::default() };
    let svg = vtracer::convert(vtracer::ColorImage { pixels: small.into_raw(), width: w, height: h }, config)
        .map_err(|e| AppError::tool("Tracing the image failed", e))?
        .to_string();
    // vtracer starts with an XML declaration and a comment; the output starts at <svg like imagetracerjs.
    let start = svg.find("<svg").unwrap_or(0);
    Ok(svg[start..].to_string())
}
