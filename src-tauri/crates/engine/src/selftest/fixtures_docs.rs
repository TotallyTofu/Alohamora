//! Image and PDF fixtures (the part of fixtures.ts that used sharp, pdf-lib and piexifjs), plus the
//! file checks the image/PDF cases need (formats, sizes, pixels, zip entries, PDF pages/rotation/title, EXIF).

use std::io::Cursor;
use std::path::Path;

use alohamora_core::options::{PageSize, TextFont};
use exif::{Field, In, Rational, Tag, Value};
use image::{DynamicImage, ImageFormat};
use img_parts::{Bytes, ImageEXIF};
use lopdf::{dictionary, Document, Object, Stream};

use super::assert::{check, expect_non_empty, Check};
use super::fixtures::ensure;
use crate::image::encode;
use crate::pdf::create::{EmbedKind, EmbeddableImage, PdfBuilder};
use crate::{AppError, Result};

pub const TEST_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1">
<stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#2b6cff"/></linearGradient></defs>
<rect x="40" y="40" width="720" height="520" rx="60" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>"##;

fn svg_image() -> Result<DynamicImage> {
    Ok(DynamicImage::ImageRgba8(crate::image::svg::render_str(TEST_SVG)?)) // 800×600, transparent corners
}

fn png_fixture(dir: &Path) -> Result<DynamicImage> {
    image::open(ensure(dir, "image.png")?).map_err(AppError::other)
}

/// EXIF block (raw TIFF) from fields.
fn exif_bytes(fields: &[Field]) -> Result<Vec<u8>> {
    let mut w = exif::experimental::Writer::new();
    for f in fields {
        w.push_field(f);
    }
    let mut out = Cursor::new(Vec::new());
    w.write(&mut out, false).map_err(AppError::other)?;
    Ok(out.into_inner())
}

fn jpeg_with_exif(jpeg: Vec<u8>, exif: Vec<u8>) -> Result<Vec<u8>> {
    let mut j = img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg)).map_err(AppError::other)?;
    j.set_exif(Some(Bytes::from(exif)));
    let mut out = Vec::new();
    j.encoder().write_to(&mut out)?;
    Ok(out)
}

fn rationals(v: &[(u32, u32)]) -> Value {
    Value::Rational(v.iter().map(|&(num, denom)| Rational { num, denom }).collect())
}

/// Text for a PDF literal string in WinAnsiEncoding ("•" = 0x95).
fn win_ansi(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for ch in s.chars() {
        match ch {
            '(' | ')' | '\\' => {
                out.push(b'\\');
                out.push(ch as u8);
            }
            '•' => out.push(0x95),
            c if c.is_ascii() => out.push(c as u8),
            _ => out.push(b'?'),
        }
    }
    out
}

fn text_op(font: &str, size: f64, x: f64, y: f64, text: &str) -> Vec<u8> {
    let mut v = format!("BT /{font} {size} Tf {x} {y} Td (").into_bytes();
    v.extend(win_ansi(text));
    v.extend(b") Tj ET\n");
    v
}

/// 3 Letter pages: title/chapter headings, a wrapped paragraph, a picture on page 2, bullets on page 3, page numbers.
fn make_doc_pdf(dir: &Path, out: &str) -> Result<()> {
    let jpeg = encode::jpeg_bytes(&png_fixture(dir)?, 80.0)?;
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font = |base: &str| dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => base.to_string(), "Encoding" => "WinAnsiEncoding" };
    let bold_id = doc.add_object(font("Helvetica-Bold"));
    let reg_id = doc.add_object(font("Helvetica"));
    let img_id = doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 800, "Height" => 600, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode" },
        jpeg,
    ).with_compression(false));
    let para = "Alohamora converts files offline. This paragraph is long enough to wrap across several lines so that the reflow logic has something to join back together into one paragraph.";
    let mut kids = Vec::new();
    for p in 1..=3 {
        let mut c = text_op("F1", 24.0, 72.0, 700.0, &if p == 1 { "Alohamora Test Document".to_string() } else { format!("Chapter {p}") });
        // Wrap at ~76 characters (≈460 pt of 12 pt Helvetica).
        let mut line = String::new();
        let mut y = 660.0;
        for w in para.split(' ') {
            if !line.is_empty() && line.len() + 1 + w.len() > 76 {
                c.extend(text_op("F2", 12.0, 72.0, y, &line));
                y -= 16.0;
                line.clear();
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(w);
        }
        c.extend(text_op("F2", 12.0, 72.0, y, &line));
        if p == 2 {
            c.extend(b"q 240 0 0 180 72 300 cm /Im0 Do Q\n");
        }
        if p == 3 {
            c.extend(text_op("F2", 12.0, 72.0, 520.0, "• First item"));
            c.extend(text_op("F2", 12.0, 72.0, 502.0, "• Second item"));
        }
        c.extend(text_op("F2", 10.0, 300.0, 30.0, &p.to_string()));
        let content_id = doc.add_object(Stream::new(dictionary! {}, c));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Contents" => content_id,
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => bold_id, "F2" => reg_id }, "XObject" => dictionary! { "Im0" => img_id } },
        });
        kids.push(page_id.into());
    }
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 3 }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    let info = doc.add_object(dictionary! { "Title" => Object::string_literal("Alohamora Test") });
    doc.trailer.set("Root", catalog);
    doc.trailer.set("Info", info);
    doc.compress();
    doc.save(out).map_err(AppError::other)?;
    Ok(())
}

/// A4 page that is only a picture of the words "ALOHAMORA OCR TEST" (no text layer).
fn make_scan_pdf(dir: &Path, out: &str) -> Result<()> {
    let text_pdf = dir.join("tmp-scan-src.pdf");
    std::fs::write(&text_pdf, crate::text_pdf::text_to_pdf_with("ALOHAMORA OCR TEST\n\nHello offline world.", "scan", TextFont::Sans, 28.0, PageSize::A4)?)?;
    let doc = crate::pdf::open(&text_pdf)?;
    let page = crate::pdf::render_page(&doc, 0, 200.0)?;
    let img = EmbeddableImage { kind: EmbedKind::Png, data: encode::png_bytes(&page)?, width: page.width(), height: page.height() };
    let mut b = PdfBuilder::new();
    b.add_image_page(&img, 595.28, 841.89, 0.0, 0.0, 595.28, 841.89)?;
    std::fs::write(out, b.finish()?)?;
    Ok(())
}

/// Called by fixtures::make for names it does not know. None = unknown fixture.
pub fn make(dir: &Path, name: &str, out: &str) -> Option<Result<()>> {
    let r = (|| -> Result<()> {
        match name {
            "image.svg" => std::fs::write(out, TEST_SVG)?,
            "image.png" => std::fs::write(out, encode::png_bytes(&svg_image()?)?)?,
            "photo.jpg" => {
                // 800×600 pixels + EXIF orientation 6 (display 600×800)
                let jpeg = encode::jpeg_bytes(&svg_image()?, 90.0)?;
                let orient = exif_bytes(&[Field { tag: Tag::Orientation, ifd_num: In::PRIMARY, value: Value::Short(vec![6]) }])?;
                std::fs::write(out, jpeg_with_exif(jpeg, orient)?)?
            }
            "image.webp" => std::fs::write(out, encode::webp_bytes(&png_fixture(dir)?, 80.0)?)?,
            "image.tiff" => std::fs::write(out, encode::tiff_bytes(&png_fixture(dir)?)?)?,
            "image.avif" => std::fs::write(out, encode::avif_bytes(&png_fixture(dir)?, 80.0)?)?,
            "image.bmp" => std::fs::write(out, encode::bmp_bytes(&png_fixture(dir)?)?)?,
            "image.heic" => encode::encode_heic_file(Path::new(&ensure(dir, "image.png")?), Path::new(out), 80.0, None)?,
            "doc.pdf" => make_doc_pdf(dir, out)?,
            "doc-copy.pdf" => {
                std::fs::copy(ensure(dir, "doc.pdf")?, out)?;
            }
            "scan.pdf" => make_scan_pdf(dir, out)?,
            "gps.jpg" => {
                let jpeg = encode::jpeg_bytes(&png_fixture(dir)?, 80.0)?;
                let ascii = |tag, s: &str| Field { tag, ifd_num: In::PRIMARY, value: Value::Ascii(vec![s.as_bytes().to_vec()]) };
                let exif = exif_bytes(&[
                    ascii(Tag::Artist, "Tester"),
                    ascii(Tag::GPSLatitudeRef, "N"),
                    Field { tag: Tag::GPSLatitude, ifd_num: In::PRIMARY, value: rationals(&[(21, 1), (1, 1), (3000, 100)]) },
                    ascii(Tag::GPSLongitudeRef, "E"),
                    Field { tag: Tag::GPSLongitude, ifd_num: In::PRIMARY, value: rationals(&[(105, 1), (51, 1), (0, 1)]) },
                ])?;
                std::fs::write(out, jpeg_with_exif(jpeg, exif)?)?
            }
            _ => return Err(AppError::other("unknown")),
        }
        Ok(())
    })();
    match r {
        Err(AppError::Other(m)) if m == "unknown" => None,
        other => Some(other),
    }
}

// ---------- checks ----------

fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn pdf_pages(file: &str) -> std::result::Result<usize, String> {
    expect_non_empty(file)?;
    Ok(crate::pdf::open(Path::new(file)).map_err(s)?.pages().len() as usize)
}

pub fn expect_pdf_pages(file: &str, pages: usize) -> Check {
    let n = pdf_pages(file)?;
    check(n == pages, format!("PDF pages: expected {pages}, got {n}"))
}

/// Rotation of page `index` in degrees.
pub fn pdf_rotation(file: &str, index: usize) -> std::result::Result<i32, String> {
    use pdfium_render::prelude::*;
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    let page = doc.pages().get(index as PdfPageIndex).map_err(|e| format!("{e:?}"))?;
    Ok(match page.rotation().map_err(|e| format!("{e:?}"))? {
        PdfPageRenderRotation::None => 0,
        PdfPageRenderRotation::Degrees90 => 90,
        PdfPageRenderRotation::Degrees180 => 180,
        PdfPageRenderRotation::Degrees270 => 270,
    })
}

/// (Title, Author) from the PDF's document information.
pub fn pdf_title_author(file: &str) -> std::result::Result<(Option<String>, Option<String>), String> {
    use pdfium_render::prelude::*;
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    let get = |t| doc.metadata().get(t).map(|v| v.value().to_string()).filter(|v| !v.is_empty());
    Ok((get(PdfDocumentMetadataTagType::Title), get(PdfDocumentMetadataTagType::Author)))
}

/// Page size in points of page `index`.
pub fn pdf_page_size(file: &str, index: usize) -> std::result::Result<(f64, f64), String> {
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    crate::pdf::page_sizes(&doc).get(index).copied().ok_or_else(|| "no such page".to_string())
}

/// Format names as sharp reported them: "jpeg", "png", "webp", "tiff", "bmp", "avif".
pub fn image_format(file: &str) -> std::result::Result<String, String> {
    let bytes = std::fs::read(file).map_err(s)?;
    if bytes.len() > 12 && &bytes[4..12] == b"ftypavif" {
        return Ok("avif".into());
    }
    Ok(match image::guess_format(&bytes).map_err(s)? {
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::Png => "png",
        ImageFormat::WebP => "webp",
        ImageFormat::Tiff => "tiff",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Gif => "gif",
        other => return Ok(format!("{other:?}").to_lowercase()),
    }
    .into())
}

pub fn image_dims(file: &str) -> std::result::Result<(u32, u32), String> {
    image::image_dimensions(file).map_err(s)
}

/// Format must match; size too when given.
pub fn expect_image(file: &str, format: &str, dims: Option<(u32, u32)>) -> Check {
    expect_non_empty(file)?;
    let f = image_format(file)?;
    check(f == format, format!("image format: expected {format}, got {f}"))?;
    if let Some((w, h)) = dims {
        let (aw, ah) = image_dims(file)?;
        check(aw == w && ah == h, format!("size: expected {w}x{h}, got {aw}x{ah}"))?;
    }
    Ok(())
}

/// RGBA of one pixel.
pub fn pixel(file: &str, x: u32, y: u32) -> std::result::Result<[u8; 4], String> {
    let img = image::open(file).map_err(s)?.to_rgba8();
    Ok(img.get_pixel(x, y).0)
}

/// Names of all entries in a zip (DOCX/EPUB).
pub fn zip_entries(file: &str) -> std::result::Result<Vec<String>, String> {
    let f = std::fs::File::open(file).map_err(s)?;
    let z = zip::ZipArchive::new(f).map_err(s)?;
    Ok(z.file_names().map(String::from).collect())
}

pub fn expect_zip_entries(file: &str, names: &[&str]) -> std::result::Result<Vec<String>, String> {
    expect_non_empty(file)?;
    let entries = zip_entries(file)?;
    for n in names {
        check(entries.iter().any(|e| e == n), format!("zip {file} has no entry {n}"))?;
    }
    Ok(entries)
}

pub fn zip_text(file: &str, name: &str) -> std::result::Result<String, String> {
    use std::io::Read;
    let f = std::fs::File::open(file).map_err(s)?;
    let mut z = zip::ZipArchive::new(f).map_err(s)?;
    let mut e = z.by_name(name).map_err(s)?;
    let mut text = String::new();
    e.read_to_string(&mut text).map_err(s)?;
    Ok(text)
}

/// (Artist, has GPS, Orientation) from a file's EXIF; missing EXIF = (None, false, None).
pub fn exif_summary(file: &str) -> (Option<String>, bool, Option<u32>) {
    let Ok(f) = std::fs::File::open(file) else { return (None, false, None) };
    let Ok(e) = exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)) else { return (None, false, None) };
    let artist = e.get_field(Tag::Artist, In::PRIMARY).and_then(|f| match &f.value {
        Value::Ascii(v) => v.first().map(|b| String::from_utf8_lossy(b).trim_end_matches('\0').to_string()),
        _ => None,
    });
    let gps = e.fields().any(|f| f.tag.context() == exif::Context::Gps && f.tag != Tag::GPSVersionID);
    let orientation = e.get_field(Tag::Orientation, In::PRIMARY).and_then(|f| f.value.get_uint(0));
    (artist, gps, orientation)
}
