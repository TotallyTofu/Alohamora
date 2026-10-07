//! Port of src/main/selftest/cases/tools-pdf.ts (PDF tools + the subtitle tool).

use alohamora_core::types::{Capabilities, ToolId};
use serde_json::{json, Value};

use super::{tool_case, tool_error, Case};
use crate::selftest::assert::{check, expect_count, expect_text_includes, read_text, Check};
use crate::selftest::fixtures_docs::{expect_pdf_pages, expect_zip_entries, image_dims, pdf_rotation, pdf_title_author};

fn no_ocr(c: &Capabilities) -> Option<String> {
    if c.ocr_languages.iter().any(|l| l == "eng") { None } else { Some("no English OCR data".into()) }
}

fn case(name: &str, fixtures: &[&'static str], tool: ToolId, options: Value, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    tool_case(&format!("tools.pdf.{name}"), "tools.pdf", fixtures, tool, options, verify)
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("merge", &["doc.pdf", "doc-copy.pdf"], ToolId::PdfMerge, json!({}), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 6)
        }),
        case("split-each", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "each" }), |o| {
            expect_count(o, 3)?;
            o.iter().try_for_each(|f| expect_pdf_pages(f, 1))
        }),
        case("split-ranges", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "ranges", "ranges": "1-2,3" }), |o| expect_count(o, 2)),
        case("split-extract", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "extract", "ranges": "2" }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 1)
        }),
        tool_error("tools.pdf.split-bad-range-fails", "tools.pdf", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "extract", "ranges": "9" }), "(?-i)doesn't exist"),
        case("organize", &["doc.pdf"], ToolId::PdfOrganize, json!({ "pages": [{ "src": 2, "rotate": 90 }, { "src": 0, "rotate": 0 }] }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 2)?;
            check(pdf_rotation(&o[0], 0)? == 90, "first page should be rotated 90°")
        }),
        case("images", &["doc.pdf"], ToolId::PdfImages, json!({ "format": "png", "dpi": 72, "ranges": "1" }), |o| {
            expect_count(o, 1)?;
            check(image_dims(&o[0])?.0 == 612, "a US-letter page at 72 DPI is 612 px wide")
        }),
        case("compress-balanced", &["doc.pdf"], ToolId::PdfCompress, json!({ "level": "balanced" }), |o| {
            check(o.len() <= 1, format!("expected 0 or 1 outputs, got {}", o.len()))?;
            if o.len() == 1 { expect_pdf_pages(&o[0], 3) } else { Ok(()) }
        }),
        case("compress-max", &["doc.pdf"], ToolId::PdfCompress, json!({ "level": "max" }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 3)
        }),
    ];
    let mut ocr_txt = case("ocr-txt", &["scan.pdf"], ToolId::PdfOcr, json!({ "languages": ["eng"], "output": "txt" }), |o| {
        expect_count(o, 1)?;
        check(read_text(&o[0]).to_uppercase().contains("ALOHAMORA"), "OCR text should contain ALOHAMORA")
    });
    ocr_txt.skip = Some(no_ocr);
    let mut ocr_pdf = case("ocr-pdf", &["scan.pdf"], ToolId::PdfOcr, json!({ "languages": ["eng"], "output": "pdf" }), |o| {
        expect_count(o, 1)?;
        expect_pdf_pages(&o[0], 1)
    });
    ocr_pdf.skip = Some(no_ocr);
    v.push(ocr_txt);
    v.push(ocr_pdf);
    v.push(case("word", &["doc.pdf"], ToolId::PdfWord, json!({}), |o| {
        expect_count(o, 1)?;
        expect_zip_entries(&o[0], &["word/document.xml"]).map(|_| ())
    }));
    v.push(case("metadata-title", &["doc.pdf"], ToolId::PdfMetadata, json!({ "title": "New Title", "author": "Me", "keywords": "a, b" }), |o| {
        expect_count(o, 1)?;
        let (title, author) = pdf_title_author(&o[0])?;
        check(title.as_deref() == Some("New Title"), format!("title should be New Title, got {title:?}"))?;
        check(author.as_deref() == Some("Me"), "author should be Me")
    }));
    v.push(case("metadata-remove-all", &["doc.pdf"], ToolId::PdfMetadata, json!({ "removeAll": true }), |o| {
        expect_count(o, 1)?;
        check(pdf_title_author(&o[0])?.0.is_none(), "title should be gone")?;
        expect_pdf_pages(&o[0], 3)
    }));
    v
}

pub fn subtitle_cases() -> Vec<Case> {
    vec![tool_case("tools.subtitle.shift", "tools.subtitle", &["subs.srt"], ToolId::SubtitleShift, json!({ "offsetMs": 1000 }), |o| {
        expect_count(o, 1)?;
        expect_text_includes(&o[0], "00:00:02,000 --> 00:00:03,500")
    })]
}
