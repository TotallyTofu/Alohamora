//! OCR with Tesseract (port of engines/ocr.ts; tesseract.js → tesseract-rs, built from source, linked in).
//! Language data comes ONLY from `<resources>/tessdata` (never downloaded).
//! Searchable PDFs are built by us from Tesseract's word boxes (TSV): tesseract-rs builds Leptonica without
//! zlib, and Tesseract's own PDF renderer then crashes (it writes a null compressed buffer).

use std::path::Path;

use alohamora_core::pdf_reflow::{text_to_blocks, Block};
use image::DynamicImage;
use tesseract_rs::TesseractAPI;

use crate::jobs::JobContext;
use crate::paths::tessdata_dir;
use crate::pdf::create::{OcrWord, PdfBuilder, SearchablePage};
use crate::{AppError, Result};

const OCR_DPI: f64 = 300.0;

/// Languages from `wanted` that have a `<lang>.traineddata` file.
pub fn available_langs(wanted: &[String]) -> Vec<String> {
    wanted.iter().filter(|l| tessdata_dir().join(format!("{l}.traineddata")).exists()).cloned().collect()
}

fn ocr_err(e: impl std::fmt::Debug) -> AppError {
    AppError::tool("Text recognition failed", format!("{e:?}"))
}

fn new_api(langs: &[String]) -> Result<TesseractAPI> {
    let wanted = if langs.is_empty() { vec!["eng".to_string()] } else { langs.to_vec() };
    let ok = available_langs(&wanted);
    if ok.is_empty() {
        return Err(AppError::user("No OCR language data found. Reinstall Alohamora."));
    }
    let api = TesseractAPI::new();
    api.init(tessdata_dir(), &ok.join("+")).map_err(ocr_err)?;
    api.set_variable("user_defined_dpi", "300").map_err(ocr_err)?;
    Ok(api)
}

/// Give a rendered page to Tesseract (8-bit grey is enough and fastest).
fn set_page(api: &TesseractAPI, img: &DynamicImage) -> Result<()> {
    let gray = img.to_luma8();
    let (w, h) = (gray.width() as i32, gray.height() as i32);
    api.set_image(gray.as_raw(), w, h, 1, w).map_err(ocr_err)?;
    api.set_source_resolution(OCR_DPI as i32).map_err(ocr_err)?;
    Ok(())
}

fn page_text(api: &TesseractAPI, img: &DynamicImage) -> Result<String> {
    set_page(api, img)?;
    api.get_utf8_text().map_err(ocr_err)
}

/// OCR pages of a PDF into reflow blocks (used by PDF → TXT/DOCX/EPUB when the PDF has no text layer).
pub fn ocr_pdf_to_blocks(pdf_path: &Path, ctx: &JobContext, page_indexes: Option<Vec<usize>>) -> Result<Vec<Block>> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let api = new_api(&ctx.settings.ocr_languages)?;
    let pages = page_indexes.unwrap_or_else(|| (0..total).collect());
    let mut blocks = Vec::new();
    for (k, &p) in pages.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, OCR_DPI)?;
        blocks.extend(text_to_blocks(&page_text(&api, &img)?));
        if k + 1 < pages.len() {
            blocks.push(Block::PageBreak);
        }
        ctx.progress((k + 1) as f64 / pages.len() as f64, Some(format!("Reading page {} of {}", p + 1, total)));
    }
    Ok(blocks)
}

/// Words (TSV level 5) from `TessBaseAPIGetTsvText`: level page block par line word left top width height conf text.
pub fn parse_tsv_words(tsv: &str) -> Vec<OcrWord> {
    tsv.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 12 || c[0] != "5" || c[10].starts_with('-') {
                return None;
            }
            let text = c[11..].join("\t").trim().to_string();
            if text.is_empty() {
                return None;
            }
            let n = |i: usize| c[i].parse::<f64>().ok();
            Some(OcrWord { left: n(6)?, top: n(7)?, width: n(8)?, height: n(9)?, text })
        })
        .collect()
}

/// Result of `ocr_pages`: all text (with page headers) and, when asked for, one searchable PDF.
pub struct OcrResult {
    pub text: String,
    pub pdf: Option<Vec<u8>>,
}

/// Port of ocrPages. With `want_pdf`, each page becomes picture + invisible text (one searchable PDF).
pub fn ocr_pages(pdf_path: &Path, ctx: &JobContext, langs: &[String], indexes: &[usize], want_pdf: bool) -> Result<OcrResult> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let api = new_api(langs)?;
    let mut texts = Vec::new();
    let mut builder = if want_pdf { Some(PdfBuilder::new()) } else { None };
    for (k, &p) in indexes.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, OCR_DPI)?;
        let text = page_text(&api, &img)?;
        texts.push(format!("--- Page {} ---\n{}", p + 1, text.trim()));
        if let Some(b) = builder.as_mut() {
            let words = parse_tsv_words(&api.get_tsv_text(0).map_err(ocr_err)?);
            let jpeg = crate::image::encode::jpeg_bytes(&img, 85.0)?;
            b.add_searchable_page(&SearchablePage { jpeg, width_px: img.width(), height_px: img.height(), dpi: OCR_DPI, words })?;
        }
        ctx.progress((k + 1) as f64 / indexes.len() as f64, Some(format!("Reading page {} of {}", p + 1, total)));
    }
    let pdf = match builder {
        Some(b) => Some(b.finish()?),
        None => None,
    };
    Ok(OcrResult { text: texts.join("\n\n") + "\n", pdf })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tsv_words() {
        let tsv = "1\t1\t0\t0\t0\t0\t0\t0\t2480\t3508\t-1\t\n5\t1\t1\t1\t1\t1\t236\t240\t520\t60\t96.5\tALOHAMORA\n5\t1\t1\t1\t1\t2\t790\t240\t150\t60\t95\t \n";
        let w = parse_tsv_words(tsv);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].text, "ALOHAMORA");
        assert_eq!((w[0].left, w[0].top, w[0].width, w[0].height), (236.0, 240.0, 520.0, 60.0));
    }
}
