//! PDF reading and rendering with pdfium (replaces pdf.js in the hidden engine window).
//! One global `Pdfium`; the `thread_safe` feature serialises every pdfium call behind a mutex,
//! so any job thread may open, render and close documents.

pub mod create;
pub mod edit;

use std::path::Path;
use std::sync::OnceLock;

use alohamora_core::options::StillFormat;
use alohamora_core::pdf_reflow::{TextItem, TextPage};
use image::DynamicImage;
use pdfium_render::prelude::*;

use crate::fsutil::data_url;
use crate::{AppError, Result};

pub const MSG_PASSWORD: &str = "This PDF is password-protected. Remove the password first, then try again.";
pub const MSG_DAMAGED: &str = "This PDF could not be opened. It may be damaged.";

/// Pixel cap for one rendered page (pdf.js used 120 MP).
const MAX_RENDER_PIXELS: f64 = 120_000_000.0;

static PDFIUM: OnceLock<std::result::Result<Pdfium, String>> = OnceLock::new();

/// Bind pdfium from `<resources>/pdfium/` once.
pub fn pdfium() -> Result<&'static Pdfium> {
    let bound = PDFIUM.get_or_init(|| {
        let lib = Pdfium::pdfium_platform_library_name_at_path(&crate::paths::pdfium_dir());
        Pdfium::bind_to_library(&lib).map(Pdfium::new).map_err(|e| format!("{e:?} ({})", lib.display()))
    });
    bound.as_ref().map_err(|e| AppError::tool("The PDF engine could not be loaded.", e.clone()))
}

fn open_error(e: PdfiumError) -> AppError {
    let text = format!("{e:?}");
    if text.contains("Password") {
        AppError::user(MSG_PASSWORD)
    } else {
        AppError::user_with(MSG_DAMAGED, text)
    }
}

pub fn open(path: &Path) -> Result<PdfDocument<'static>> {
    pdfium()?.load_pdf_from_file(path, None).map_err(open_error)
}

/// Page sizes in points, after /Rotate (same as pdf.js viewport at scale 1).
pub fn page_sizes(doc: &PdfDocument) -> Vec<(f64, f64)> {
    doc.pages().iter().map(|p| (p.width().value as f64, p.height().value as f64)).collect()
}

fn pdf_err(e: PdfiumError) -> AppError {
    AppError::tool("The PDF engine failed", format!("{e:?}"))
}

/// Render one page at `dpi` on white. Very large pages are scaled down to stay under the pixel cap.
pub fn render_page(doc: &PdfDocument, index: usize, dpi: f64) -> Result<DynamicImage> {
    let page = doc.pages().get(index as PdfPageIndex).map_err(pdf_err)?;
    let mut scale = dpi / 72.0;
    let px = page.width().value as f64 * scale * page.height().value as f64 * scale;
    if px > MAX_RENDER_PIXELS {
        scale *= (MAX_RENDER_PIXELS / px).sqrt();
    }
    let config = PdfRenderConfig::new()
        .scale_page_by_factor(scale as f32)
        .render_form_data(true)
        .render_annotations(true);
    let bitmap = page.render_with_config(&config).map_err(pdf_err)?;
    let img = bitmap.as_image().map_err(pdf_err)?;
    // pdfium leaves transparent areas transparent; flatten so PNGs look like the printed page.
    Ok(DynamicImage::ImageRgb8(crate::image::encode::flatten(&img, [255, 255, 255])))
}

/// Encode a rendered page. `quality` is 0–1 like canvas.toBlob.
pub fn encode_page(img: &DynamicImage, fmt: StillFormat, quality: f64) -> Result<Vec<u8>> {
    match fmt {
        StillFormat::Png => crate::image::encode::png_bytes(img),
        StillFormat::Jpg => crate::image::encode::jpeg_bytes(img, (quality * 100.0) as f32),
    }
}

/// What `inspect` needs: page count, first page size and a small first-page thumbnail.
pub struct PdfInfo {
    pub pages: u32,
    pub first_width_pt: f64,
    pub first_height_pt: f64,
    pub thumbnail: Option<String>,
}

pub fn info_with_thumbnail(path: &Path, max_width: u32) -> Result<PdfInfo> {
    let doc = open(path)?;
    let sizes = page_sizes(&doc);
    let (w, h) = sizes.first().copied().unwrap_or((0.0, 0.0));
    let thumbnail = if sizes.is_empty() { None } else { thumbnail_of(&doc, 0, max_width).ok() };
    Ok(PdfInfo { pages: sizes.len() as u32, first_width_pt: w, first_height_pt: h, thumbnail })
}

fn thumbnail_of(doc: &PdfDocument, index: usize, max_width: u32) -> Result<String> {
    let page = doc.pages().get(index as PdfPageIndex).map_err(pdf_err)?;
    let dpi = 72.0 * max_width as f64 / page.width().value.max(1.0) as f64;
    let img = render_page(doc, index, dpi)?;
    Ok(data_url("image/jpeg", &crate::image::encode::jpeg_bytes(&img, 75.0)?))
}

/// JPEG data URLs for the page grid in the Organize panel (port of `pdf.thumbnails`).
pub fn thumbnails(path: &Path, max_width: u32, max_pages: Option<usize>) -> Result<Vec<String>> {
    let doc = open(path)?;
    let n = (doc.pages().len() as usize).min(max_pages.unwrap_or(500));
    (0..n).map(|i| thumbnail_of(&doc, i, max_width)).collect()
}

fn is_bold(font: &str) -> bool {
    let f = font.to_lowercase();
    ["bold", "black", "heavy", "semibold", "demi"].iter().any(|k| f.contains(k))
}

fn is_italic(font: &str) -> bool {
    let f = font.to_lowercase();
    f.contains("italic") || f.contains("oblique")
}

/// Text runs per page in the same shape pdf.js produced: x/y = left/baseline in top-left page space.
pub fn extract_text(doc: &PdfDocument) -> Result<Vec<TextPage>> {
    let mut pages = Vec::new();
    for page in doc.pages().iter() {
        let (pw, ph) = (page.width().value as f64, page.height().value as f64);
        let text = page.text().map_err(pdf_err)?;
        let mut items = Vec::new();
        for seg in text.segments().iter() {
            let s = seg.text();
            if s.trim().is_empty() {
                continue;
            }
            let b = seg.bounds();
            let (mut font_size, mut font) = (0.0, String::new());
            if let Ok(chars) = seg.chars() {
                if let Some(c) = chars.iter().find(|c| c.unicode_char().map(|ch| !ch.is_whitespace()).unwrap_or(false)) {
                    font_size = c.scaled_font_size().value as f64;
                    font = c.font_name();
                }
            }
            let h = (b.top().value - b.bottom().value) as f64;
            if font_size <= 0.0 {
                font_size = h;
            }
            items.push(TextItem {
                str: s,
                x: b.left().value as f64,
                y: ph - b.bottom().value as f64,
                w: (b.right().value - b.left().value) as f64,
                h: if h > 0.0 { h } else { font_size },
                font_size,
                bold: is_bold(&font),
                italic: is_italic(&font),
            });
        }
        pages.push(TextPage { width: pw, height: ph, items });
    }
    Ok(pages)
}

/// Read the document title (used by the self-test).
pub fn title(path: &Path) -> Result<Option<String>> {
    let doc = open(path)?;
    Ok(doc.metadata().get(PdfDocumentMetadataTagType::Title).map(|t| t.value().to_string()).filter(|t| !t.is_empty()))
}
