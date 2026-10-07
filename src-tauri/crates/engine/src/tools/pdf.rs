//! Port of src/main/tools/pdf/*.ts.

use std::path::Path;

use alohamora_core::js::{js_num, js_round};
use alohamora_core::options::*;
use alohamora_core::page_ranges::{flatten_ranges, parse_page_ranges};
use alohamora_core::pdf_split::split_groups;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::order_files;
use crate::jobs::{JobContext, OutputSpec};
use crate::pdf::{create, edit, open, page_sizes, render_page, encode_page};
use crate::{AppError, Result};

fn src(file: &FileInfo) -> &Path {
    Path::new(&file.path)
}

/// Page ranges typed by the user → 0-based page indexes (range errors become user errors).
fn page_indexes(ranges: &str, total: u32) -> Result<Vec<usize>> {
    let groups = parse_page_ranges(ranges, total as usize).map_err(AppError::user)?;
    Ok(flatten_ranges(&groups))
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfCompressOptions = with_defaults(ToolId::PdfCompress, options);
    let out = ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("compressed"));
    if o.level == PdfCompressLevel::Max {
        let doc = open(src(file))?;
        let sizes = page_sizes(&doc);
        let mut pages = Vec::with_capacity(sizes.len());
        for (i, (w, h)) in sizes.iter().enumerate() {
            ctx.check_cancel()?;
            let img = render_page(&doc, i, 110.0)?;
            pages.push((encode_page(&img, StillFormat::Jpg, 0.6)?, *w, *h));
            ctx.progress((i + 1) as f64 / sizes.len() as f64, None);
        }
        std::fs::write(&out, create::page_images_to_pdf(&pages)?)?;
        ctx.note("Pages were converted to images (text is no longer selectable)");
        return Ok(());
    }
    open(src(file))?; // same password/damaged errors as everywhere else
    let (bytes, _) = edit::recompress_images(src(file), o.level, &|p| ctx.progress(p * 0.9, None), &ctx.cancel)?;
    if bytes.len() as f64 >= file.size as f64 * 0.98 {
        ctx.drop_output(&out);
        ctx.note("Already optimized — no smaller file was made");
        return Ok(());
    }
    std::fs::write(&out, &bytes)?;
    let saved = js_round((1.0 - bytes.len() as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(bytes.len() as u64), js_num(saved)));
    Ok(())
}

pub fn merge(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfMergeOptions = with_defaults(ToolId::PdfMerge, options);
    let ordered = order_files(files, &o.order);
    let paths: Vec<&Path> = ordered.iter().map(src).collect();
    let bytes = edit::merge(&paths, &|p| ctx.progress(p, None), &ctx.cancel)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&ordered[0].path, "pdf").suffix("merged")), bytes)?;
    let pages: u32 = ordered.iter().map(|f| f.pages.unwrap_or(0)).sum();
    ctx.note(if pages > 0 { format!("{pages} pages") } else { format!("{} PDFs merged", ordered.len()) });
    Ok(())
}

pub fn split(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfSplitOptions = with_defaults(ToolId::PdfSplit, options);
    let doc = open(src(file))?;
    let total = doc.pages().len() as usize;
    let groups = split_groups(&o, total).map_err(AppError::user)?;
    for (i, g) in groups.iter().enumerate() {
        ctx.check_cancel()?;
        let bytes = edit::extract_pages(&doc, g)?;
        let spec = if groups.len() > 1 {
            OutputSpec::new(&file.path, "pdf").group("part", i + 1, groups.len())
        } else {
            OutputSpec::new(&file.path, "pdf").suffix(if o.mode == PdfSplitMode::Every { "part" } else { "extract" })
        };
        std::fs::write(ctx.new_output(spec), bytes)?;
        ctx.progress((i + 1) as f64 / groups.len() as f64, None);
    }
    ctx.note(format!("{} file{}", groups.len(), if groups.len() == 1 { "" } else { "s" }));
    Ok(())
}

pub fn organize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfOrganizeOptions = with_defaults(ToolId::PdfOrganize, options);
    if o.pages.is_empty() {
        return Err(AppError::user("Nothing changed"));
    }
    let doc = open(src(file))?;
    let total = doc.pages().len() as usize;
    if o.pages.iter().any(|p| p.src.fract() != 0.0 || p.src < 0.0 || p.src as usize >= total) {
        return Err(AppError::user("A page in the list does not exist."));
    }
    let pages: Vec<(usize, i32)> = o.pages.iter().map(|p| (p.src as usize, js_round(p.rotate) as i32)).collect();
    let bytes = edit::organize(&doc, &pages)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("organized")), bytes)?;
    ctx.note(format!("{} of {} pages kept", o.pages.len(), total));
    Ok(())
}

pub fn images(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfImagesOptions = with_defaults(ToolId::PdfImages, options);
    let indexes = page_indexes(&o.ranges, file.pages.unwrap_or(0))?;
    crate::convert::pdf::pdf_to_images(src(file), &file.path, o.format, o.dpi, o.quality / 100.0, ctx, Some(indexes))
}

pub fn ocr(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfOcrOptions = with_defaults(ToolId::PdfOcr, options);
    let wanted: Vec<String> = o.languages.iter().filter(|l| ctx.caps.ocr_languages.contains(l)).cloned().collect();
    let langs = if wanted.is_empty() { vec!["eng".to_string()] } else { wanted };
    let indexes = page_indexes(&o.ranges, file.pages.unwrap_or(0))?;
    let r = crate::ocr::ocr_pages(src(file), ctx, &langs, &indexes, o.output == OcrOutput::Pdf)?;
    if o.output == OcrOutput::Txt {
        std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "txt").suffix("ocr")), r.text)?;
        return Ok(());
    }
    let pdf = r.pdf.ok_or_else(|| AppError::tool("This OCR engine version cannot write PDFs", ""))?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("searchable")), pdf)?;
    Ok(())
}

pub fn word(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfWordOptions = with_defaults(ToolId::PdfWord, options);
    let opts = ConvertOptions { doc_mode: Some(o.mode), ocr: Some(o.ocr), ..Default::default() };
    crate::convert::pdf::convert_pdf(file, Fmt::Docx, &opts, ctx)
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfMetadataOptions = with_defaults(ToolId::PdfMetadata, options);
    let doc = open(src(file))?;
    if o.remove_all {
        let bytes = edit::strip_metadata(&doc)?;
        std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("clean")), bytes)?;
        ctx.note("Bookmarks and form fields are not kept when removing all metadata.");
        return Ok(());
    }
    drop(doc);
    let bytes = edit::set_info(src(file), &o.title, &o.author, &o.subject, &o.keywords)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("meta")), bytes)?;
    ctx.note("Metadata updated");
    Ok(())
}
