//! Port of converters/pdf.ts: PDF → JPG/PNG pages, TXT, DOCX (reflow or exact pages), EPUB (reflow or fixed).

use std::path::Path;

use alohamora_core::options::{ConvertOptions, DocMode, OcrMode, StillFormat};
use alohamora_core::pdf_reflow::{blocks_to_text, blocks_to_xhtml, is_scanned, reflow_pages, split_chapters, Block};
use alohamora_core::text::guess_lang;
use alohamora_core::types::{FileInfo, Fmt};

use crate::epub::{build_fixed_epub, build_reflow_epub, Chapter, EpubMeta, FixedPage};
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

/// Render pages of `pdf_path` to images. `source` decides output naming.
/// One page → a single file; more → a "<base>-pages/" folder.
pub fn pdf_to_images(
    pdf_path: &Path, source: &str, fmt: StillFormat, dpi: f64, quality: f64, ctx: &JobContext, page_indexes: Option<Vec<usize>>,
) -> Result<()> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let pages = page_indexes.unwrap_or_else(|| (0..total).collect());
    let ext = fmt.ext();
    for (k, &p) in pages.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, dpi)?;
        let bytes = crate::pdf::encode_page(&img, fmt, quality)?;
        let spec = if pages.len() == 1 {
            OutputSpec::new(source, ext)
        } else {
            OutputSpec::new(source, ext).group("pages", p + 1, total)
        };
        std::fs::write(ctx.new_output(spec), bytes)?;
        ctx.progress((k + 1) as f64 / pages.len() as f64, None);
    }
    Ok(())
}

/// Text layer → blocks; a PDF without text is OCR'd (unless OCR is off).
fn pdf_to_blocks(file: &FileInfo, opts: &ConvertOptions, ctx: &JobContext) -> Result<Vec<Block>> {
    let path = Path::new(&file.path);
    let pages = crate::pdf::extract_text(&crate::pdf::open(path)?)?;
    if is_scanned(&pages) {
        if opts.ocr == Some(OcrMode::Off) {
            return Err(AppError::user("This PDF has no text layer (it looks scanned). Turn on OCR to extract the text."));
        }
        return crate::ocr::ocr_pdf_to_blocks(path, ctx, None);
    }
    Ok(reflow_pages(&pages, false))
}

/// Render every page as JPEG; returns (jpeg, width_pt, height_pt) per page.
fn render_all_jpeg(path: &Path, dpi: f64, quality: f64, ctx: &JobContext) -> Result<Vec<(Vec<u8>, f64, f64)>> {
    let doc = crate::pdf::open(path)?;
    let sizes = crate::pdf::page_sizes(&doc);
    let mut out = Vec::with_capacity(sizes.len());
    for (i, (w, h)) in sizes.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, i, dpi)?;
        out.push((crate::pdf::encode_page(&img, StillFormat::Jpg, quality)?, *w, *h));
        ctx.progress((i + 1) as f64 / sizes.len() as f64, None);
    }
    Ok(out)
}

pub fn convert_pdf(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let path = Path::new(&file.path);
    let doc_mode = opts.doc_mode.unwrap_or(DocMode::Reflow);
    match target {
        Fmt::Jpg => pdf_to_images(path, &file.path, StillFormat::Jpg, ctx.settings.pdf_dpi, 0.9, ctx, None),
        Fmt::Png => pdf_to_images(path, &file.path, StillFormat::Png, ctx.settings.pdf_dpi, 0.9, ctx, None),
        Fmt::Txt => {
            let blocks = pdf_to_blocks(file, opts, ctx)?;
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "txt")), blocks_to_text(&blocks))?;
            Ok(())
        }
        Fmt::Docx => {
            let out = ctx.new_output(OutputSpec::new(&file.path, "docx"));
            let bytes = if doc_mode == DocMode::Pages {
                crate::docx::page_images_to_docx(&render_all_jpeg(path, 200.0, 0.85, ctx)?)?
            } else {
                crate::docx::blocks_to_docx(&pdf_to_blocks(file, opts, ctx)?, &file.base)?
            };
            std::fs::write(out, bytes)?;
            Ok(())
        }
        Fmt::Epub => {
            let out = ctx.new_output(OutputSpec::new(&file.path, "epub"));
            let mut meta = EpubMeta { title: file.base.clone(), author: None, lang: "en".into() };
            let bytes = if doc_mode == DocMode::Pages {
                let pages: Vec<FixedPage> = render_all_jpeg(path, 150.0, 0.85, ctx)?
                    .into_iter()
                    .map(|(jpeg, w, h)| FixedPage { jpeg, width: (w * 150.0 / 72.0).round() as u32, height: (h * 150.0 / 72.0).round() as u32 })
                    .collect();
                build_fixed_epub(&meta, &pages)?
            } else {
                let blocks = pdf_to_blocks(file, opts, ctx)?;
                meta.lang = guess_lang(&blocks_to_text(&blocks)).to_string();
                let chapters: Vec<Chapter> = split_chapters(&blocks, &file.base)
                    .into_iter()
                    .map(|c| Chapter { title: c.title, body_xhtml: blocks_to_xhtml(&c.blocks) })
                    .collect();
                build_reflow_epub(&meta, &chapters)?
            };
            std::fs::write(out, bytes)?;
            Ok(())
        }
        other => Err(AppError::user(format!("Converting PDF to {} is not available yet.", other.as_str().to_uppercase()))),
    }
}
