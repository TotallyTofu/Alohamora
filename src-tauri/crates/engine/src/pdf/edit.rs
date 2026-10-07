//! Change existing PDFs. Page work (merge/split/organize/strip) uses pdfium page import, which copies
//! shared fonts and images once. Metadata and image recompression use lopdf.

use std::path::Path;

use alohamora_core::image_meta::jpeg_sof_info;
use alohamora_core::options::PdfCompressLevel;
use lopdf::{Document, Object};
use pdfium_render::prelude::*;

use super::{open, pdfium, MSG_DAMAGED, MSG_PASSWORD};
use crate::cancel::CancelToken;
use crate::{AppError, Result};

fn pdf_err(e: PdfiumError) -> AppError {
    AppError::tool("The PDF engine failed", format!("{e:?}"))
}

/// "1,3,4" (1-based) page string for pdfium's import, in the given order.
fn page_list(indexes: &[usize]) -> String {
    indexes.iter().map(|i| (i + 1).to_string()).collect::<Vec<_>>().join(",")
}

/// New PDF with the given pages (0-based, in this order).
pub fn extract_pages(src: &PdfDocument, indexes: &[usize]) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    doc.pages_mut().copy_pages_from_document(src, &page_list(indexes), 0).map_err(pdf_err)?;
    doc.save_to_bytes().map_err(pdf_err)
}

/// All pages of all files, in order.
pub fn merge(paths: &[&Path], on_progress: &dyn Fn(f64), cancel: &CancelToken) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    for (i, p) in paths.iter().enumerate() {
        cancel.check()?;
        let src = open(p)?;
        doc.pages_mut().append(&src).map_err(pdf_err)?;
        on_progress((i + 1) as f64 / paths.len() as f64);
    }
    doc.save_to_bytes().map_err(pdf_err)
}

fn degrees(r: PdfPageRenderRotation) -> i32 {
    match r {
        PdfPageRenderRotation::None => 0,
        PdfPageRenderRotation::Degrees90 => 90,
        PdfPageRenderRotation::Degrees180 => 180,
        PdfPageRenderRotation::Degrees270 => 270,
    }
}

fn rotation(deg: i32) -> PdfPageRenderRotation {
    match deg.rem_euclid(360) {
        90 => PdfPageRenderRotation::Degrees90,
        180 => PdfPageRenderRotation::Degrees180,
        270 => PdfPageRenderRotation::Degrees270,
        _ => PdfPageRenderRotation::None,
    }
}

/// Port of organizePdf: pages in a new order, each with extra rotation (multiples of 90).
pub fn organize(src: &PdfDocument, pages: &[(usize, i32)]) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    let order: Vec<usize> = pages.iter().map(|p| p.0).collect();
    doc.pages_mut().copy_pages_from_document(src, &page_list(&order), 0).map_err(pdf_err)?;
    for (i, (_, extra)) in pages.iter().enumerate() {
        if *extra % 360 == 0 {
            continue;
        }
        let mut page = doc.pages().get(i as PdfPageIndex).map_err(pdf_err)?;
        let current = page.rotation().map(degrees).unwrap_or(0);
        page.set_rotation(rotation(current + extra));
    }
    doc.save_to_bytes().map_err(pdf_err)
}

/// Same pages, no document information, XMP, bookmarks or forms (port of "remove all" metadata).
pub fn strip_metadata(src: &PdfDocument) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    doc.pages_mut().append(src).map_err(pdf_err)?;
    doc.save_to_bytes().map_err(pdf_err)
}

// ---------- lopdf ----------

/// Load with lopdf, using the same user-facing errors as pdfium.
pub fn load_lopdf(path: &Path) -> Result<Document> {
    let mut doc = Document::load(path).map_err(|e| {
        let t = e.to_string();
        if t.to_lowercase().contains("encrypt") || t.to_lowercase().contains("password") { AppError::user(MSG_PASSWORD) } else { AppError::user_with(MSG_DAMAGED, t) }
    })?;
    if doc.is_encrypted() && doc.decrypt("").is_err() {
        return Err(AppError::user(MSG_PASSWORD));
    }
    Ok(doc)
}

/// PDF text string: plain ASCII as a literal, anything else as UTF-16BE with a BOM.
fn text_string(s: &str) -> Object {
    if s.is_ascii() {
        return Object::string_literal(s);
    }
    let mut b = vec![0xfe, 0xff];
    for u in s.encode_utf16() {
        b.extend_from_slice(&u.to_be_bytes());
    }
    Object::String(b, lopdf::StringFormat::Hexadecimal)
}

/// "D:YYYYMMDDHHmmSSZ" for now (UTC).
fn pdf_date_now() -> String {
    let (y, mo, d, h, mi, s) = alohamora_core::time::utc_from_unix(alohamora_core::time::unix_now());
    format!("D:{y:04}{mo:02}{d:02}{h:02}{mi:02}{s:02}Z")
}

/// Port of the "edit" branch of runPdfMetadata. Keywords are split on commas and joined with spaces like pdf-lib.
pub fn set_info(path: &Path, title: &str, author: &str, subject: &str, keywords: &str) -> Result<Vec<u8>> {
    let mut doc = load_lopdf(path)?;
    let kw: Vec<&str> = keywords.split(',').map(|k| k.trim()).filter(|k| !k.is_empty()).collect();
    let info_id = match doc.trailer.get(b"Info").and_then(|o| o.as_reference()) {
        Ok(id) => id,
        Err(_) => {
            let id = doc.add_object(lopdf::Dictionary::new());
            doc.trailer.set("Info", id);
            id
        }
    };
    let info = doc.get_dictionary_mut(info_id).map_err(|e| AppError::user_with(MSG_DAMAGED, e.to_string()))?;
    info.set("Title", text_string(title));
    info.set("Author", text_string(author));
    info.set("Subject", text_string(subject));
    info.set("Keywords", text_string(&kw.join(" ")));
    info.set("ModDate", Object::string_literal(pdf_date_now()));
    let mut out = Vec::new();
    doc.save_modern(&mut out).map_err(AppError::other)?;
    Ok(out)
}

/// Port of recompressPdfImages: re-encode embedded JPEGs smaller. Returns (file bytes, images changed).
pub fn recompress_images(path: &Path, level: PdfCompressLevel, on_progress: &dyn Fn(f64), cancel: &CancelToken) -> Result<(Vec<u8>, usize)> {
    let (max_side, quality) = match level {
        PdfCompressLevel::Light => (3000, 82.0),
        PdfCompressLevel::Balanced => (2000, 70.0),
        _ => (1400, 55.0),
    };
    let mut doc = load_lopdf(path)?;
    let ids: Vec<_> = doc.objects.keys().copied().collect();
    let mut changed = 0;
    for (k, id) in ids.iter().enumerate() {
        cancel.check()?;
        on_progress(k as f64 / ids.len().max(1) as f64);
        let Some(Object::Stream(stream)) = doc.objects.get_mut(id) else { continue };
        let d = &stream.dict;
        let is_image = d.get(b"Subtype").and_then(|o| o.as_name()).map(|n| n == b"Image").unwrap_or(false);
        let is_dct = match d.get(b"Filter") {
            Ok(Object::Name(n)) => n == b"DCTDecode",
            Ok(Object::Array(a)) => a.len() == 1 && a[0].as_name().map(|n| n == b"DCTDecode").unwrap_or(false),
            _ => false,
        };
        let cmyk = d.get(b"ColorSpace").and_then(|o| o.as_name()).map(|n| n == b"DeviceCMYK").unwrap_or(false);
        if !is_image || !is_dct || cmyk || d.has(b"Decode") {
            continue;
        }
        let input = stream.content.clone();
        if !matches!(jpeg_sof_info(&input), Some((_, _, 1 | 3))) {
            continue; // CMYK or unreadable JPEG: leave untouched
        }
        let Ok(img) = image::load_from_memory_with_format(&input, image::ImageFormat::Jpeg) else { continue };
        let img = crate::image::fit_inside(img, max_side, max_side, false);
        let Ok(out) = crate::image::encode::jpeg_bytes(&img, quality) else { continue };
        if out.len() as f64 >= input.len() as f64 * 0.9 {
            continue;
        }
        stream.dict.set("Width", img.width() as i64);
        stream.dict.set("Height", img.height() as i64);
        stream.dict.set("ColorSpace", "DeviceRGB"); // jpeg_bytes always writes colour JPEGs
        stream.dict.set("BitsPerComponent", 8);
        stream.dict.set("Filter", "DCTDecode");
        stream.dict.remove(b"DecodeParms");
        stream.set_content(out);
        changed += 1;
    }
    let mut bytes = Vec::new();
    doc.save_modern(&mut bytes).map_err(AppError::other)?;
    Ok((bytes, changed))
}
