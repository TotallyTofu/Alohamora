//! Port of src/main/selftest/cases/image.ts.

use alohamora_core::types::{Capabilities, Fmt};
use serde_json::{json, Value};

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_magic, read_text, Check};
use crate::selftest::fixtures_docs::{exif_summary, expect_image, expect_pdf_pages, expect_zip_entries, image_dims};

const FULL: Option<(u32, u32)> = Some((800, 600));

fn no_heic(c: &Capabilities) -> Option<String> {
    if c.heif_enc { None } else { Some("no HEIC encoder on this OS".into()) }
}

fn case(name: &str, fixture: &'static str, target: Fmt, options: Option<Value>, verify: impl Fn(&str) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "image", &[fixture], target, options, move |o| {
        expect_count(o, 1)?;
        verify(&o[0])
    })
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("convert.image.png-jpg", "image.png", Fmt::Jpg, None, |f| expect_image(f, "jpeg", FULL)),
        case("convert.image.png-webp", "image.png", Fmt::Webp, None, |f| expect_image(f, "webp", FULL)),
        case("convert.image.png-avif", "image.png", Fmt::Avif, None, |f| expect_magic(f, 4, "ftypavif")),
        case("convert.image.png-tiff", "image.png", Fmt::Tiff, None, |f| expect_image(f, "tiff", None)),
        case("convert.image.png-bmp", "image.png", Fmt::Bmp, None, |f| expect_magic(f, 0, "BM")),
        case("convert.image.photo-orient", "photo.jpg", Fmt::Png, None, |f| {
            expect_image(f, "png", Some((600, 800)))?;
            let (_, _, o) = exif_summary(f);
            check(o.is_none() || o == Some(1), format!("orientation tag should be gone, got {o:?}"))
        }),
        case("convert.image.svg-png", "image.svg", Fmt::Png, None, |f| {
            expect_image(f, "png", None)?;
            let (w, _) = image_dims(f)?;
            check(w > 800, format!("SVG should render sharply (width > 800), got {w}"))
        }),
        case("convert.image.bmp-png", "image.bmp", Fmt::Png, None, |f| expect_image(f, "png", FULL)),
        case("convert.image.tiff-webp", "image.tiff", Fmt::Webp, None, |f| expect_image(f, "webp", None)),
        case("convert.image.avif-jpg", "image.avif", Fmt::Jpg, None, |f| expect_image(f, "jpeg", None)),
        case("convert.image.png-svg-trace", "image.png", Fmt::Svg, None, |f| {
            let t = read_text(f);
            check(t.trim_start().starts_with("<svg") && t.contains("<path"), "traced SVG should start with <svg and contain <path")
        }),
        case("convert.image.png-svg-embed", "image.png", Fmt::Svg, Some(json!({ "svgMode": "embed" })), |f| {
            check(read_text(f).contains("data:image/png;base64"), "embedded SVG should contain the PNG data URL")
        }),
    ];
    let mut heic_out = case("convert.image.png-heic", "image.png", Fmt::Heic, None, |f| expect_magic(f, 4, "ftyp"));
    heic_out.skip = Some(no_heic);
    let mut heic_in = case("convert.image.heic-jpg", "image.heic", Fmt::Jpg, None, |f| expect_image(f, "jpeg", FULL));
    heic_in.skip = Some(no_heic);
    v.push(heic_out);
    v.push(heic_in);
    v.push(case("convert.image.png-pdf", "image.png", Fmt::Pdf, None, |f| expect_pdf_pages(f, 1)));
    v.push(case("convert.image.photo-docx", "photo.jpg", Fmt::Docx, None, |f| {
        let entries = expect_zip_entries(f, &["word/document.xml"])?;
        check(entries.iter().any(|n| n.starts_with("word/media/")), "DOCX should contain an image under word/media/")
    }));
    v
}
