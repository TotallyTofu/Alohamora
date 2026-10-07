//! Port of src/main/selftest/cases/pdf.ts (the two EPUB → PDF cases are gone with that feature).

use std::path::Path;

use alohamora_core::types::{Capabilities, Fmt};
use serde_json::{json, Value};

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_magic, expect_text_includes, read_text, Check};
use crate::selftest::fixtures_docs::{expect_image, expect_zip_entries, image_dims, zip_text};

fn no_ocr(c: &Capabilities) -> Option<String> {
    if c.ocr_languages.iter().any(|l| l == "eng") { None } else { Some("no English OCR data".into()) }
}

fn case(name: &str, fixture: &'static str, target: Fmt, options: Option<Value>, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "pdf", &[fixture], target, options, verify)
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("convert.pdf.doc-png", "doc.pdf", Fmt::Png, None, |o| {
            expect_count(o, 3)?;
            let (w, _) = image_dims(&o[0])?;
            check((w as i64 - 2550).abs() <= 2, format!("612 pt at 300 DPI should be 2550 px wide, got {w}"))?;
            let dir = Path::new(&o[0]).parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            check(dir.ends_with("-pages"), "page images should be written into a \"-pages\" folder")?;
            let first_dir = Path::new(&o[0]).parent();
            check(o.iter().all(|f| Path::new(f).parent() == first_dir), "all pages should be in one folder")
        }),
        case("convert.pdf.doc-jpg", "doc.pdf", Fmt::Jpg, None, |o| {
            expect_count(o, 3)?;
            o.iter().try_for_each(|f| expect_image(f, "jpeg", None))
        }),
        case("convert.pdf.doc-txt", "doc.pdf", Fmt::Txt, None, |o| {
            expect_count(o, 1)?;
            expect_text_includes(&o[0], "Alohamora Test Document")?;
            expect_text_includes(&o[0], "First item")?;
            let text = read_text(&o[0]);
            check(!text.split('\n').any(|l| l.trim() == "2"), "page number \"2\" should have been removed")
        }),
        case("convert.pdf.doc-docx", "doc.pdf", Fmt::Docx, None, |o| {
            expect_count(o, 1)?;
            expect_zip_entries(&o[0], &["word/document.xml"])?;
            let xml = zip_text(&o[0], "word/document.xml")?;
            check(xml.contains("Alohamora Test Document"), "DOCX should contain the title text")?;
            check(xml.contains("Heading1"), "DOCX should use the Heading1 style")
        }),
        case("convert.pdf.doc-docx-pages", "doc.pdf", Fmt::Docx, Some(json!({ "docMode": "pages" })), |o| {
            expect_count(o, 1)?;
            let entries = expect_zip_entries(&o[0], &["word/document.xml"])?;
            let media = entries.iter().filter(|n| n.starts_with("word/media/") && !n.ends_with('/')).count();
            check(media == 3, format!("expected 3 page images, got {media}"))
        }),
        case("convert.pdf.doc-epub", "doc.pdf", Fmt::Epub, None, |o| {
            expect_count(o, 1)?;
            expect_magic(&o[0], 30, "mimetype")?;
            expect_zip_entries(&o[0], &["mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml"]).map(|_| ())
        }),
        case("convert.pdf.doc-epub-pages", "doc.pdf", Fmt::Epub, Some(json!({ "docMode": "pages" })), |o| {
            expect_count(o, 1)?;
            let entries = expect_zip_entries(&o[0], &["OEBPS/content.opf"])?;
            check(zip_text(&o[0], "OEBPS/content.opf")?.contains("pre-paginated"), "OPF should declare pre-paginated layout")?;
            let jpgs = entries.iter().filter(|n| n.ends_with(".jpg")).count();
            check(jpgs == 3, format!("expected 3 page images, got {jpgs}"))
        }),
    ];
    let mut ocr = case("convert.pdf.scan-txt-ocr", "scan.pdf", Fmt::Txt, None, |o| {
        expect_count(o, 1)?;
        let text = read_text(&o[0]).to_uppercase();
        check(text.contains("ALOHAMORA"), format!("OCR text should contain ALOHAMORA, got: {}", text.chars().take(80).collect::<String>()))?;
        check(text.contains("OCR"), "OCR text should contain OCR")
    });
    ocr.skip = Some(no_ocr);
    v.push(ocr);
    v
}
