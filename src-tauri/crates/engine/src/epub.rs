//! EPUB 3 writer (port of epubWriter.ts + epubTemplates.ts). EPUB is an OUTPUT format only (PDF → EPUB).
//! `mimetype` must be the first zip entry, stored (not compressed), with no extra field, so it sits at byte 30.

use std::io::{Cursor, Write};

use alohamora_core::text::escape_xml;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::{AppError, Result};

pub struct EpubMeta {
    pub title: String,
    pub author: Option<String>,
    pub lang: String,
}

pub struct Chapter {
    pub title: String,
    pub body_xhtml: String,
}

pub struct FixedPage {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

const STYLE_CSS: &str = "body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; }
p { margin: 0 0 0.8em; text-align: justify; }
ul { margin: 0 0 0.8em 1.2em; }";

fn chapter_xhtml(title: &str, body: &str, lang: &str) -> String {
    let (t, l) = (escape_xml(title), escape_xml(lang));
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\" xml:lang=\"{l}\" lang=\"{l}\">
<head><meta charset=\"utf-8\"/><title>{t}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>
<body>
{body}
</body>
</html>")
}

fn fixed_page_xhtml(title: &str, img: &str, w: u32, h: u32) -> String {
    let (t, i) = (escape_xml(title), escape_xml(img));
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\">
<head><meta charset=\"utf-8\"/><title>{t}</title><meta name=\"viewport\" content=\"width={w}, height={h}\"/>
<style>html,body{{margin:0;padding:0}}img{{display:block;width:{w}px;height:{h}px}}</style></head>
<body><img src=\"{i}\" alt=\"{t}\"/></body>
</html>")
}

fn nav_xhtml(title: &str, items: &[(String, String)]) -> String {
    let list: Vec<String> = items.iter().map(|(href, t)| format!("<li><a href=\"{}\">{}</a></li>", escape_xml(href), escape_xml(t))).collect();
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">
<head><meta charset=\"utf-8\"/><title>{}</title></head>
<body><nav epub:type=\"toc\" id=\"toc\"><h1>Contents</h1><ol>
{}
</ol></nav></body>
</html>", escape_xml(title), list.join("\n"))
}

struct ManifestItem {
    id: String,
    href: String,
    media_type: &'static str,
}

fn opf_xml(meta: &EpubMeta, fixed: bool, items: &[ManifestItem], images: &[ManifestItem]) -> String {
    let id = uuid::Uuid::new_v4();
    let modified = alohamora_core::time::iso_utc(alohamora_core::time::unix_now());
    let mut manifest = vec!["<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>".to_string()];
    if !fixed {
        manifest.push("<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>".to_string());
    }
    for i in items.iter().chain(images.iter()) {
        manifest.push(format!("<item id=\"{}\" href=\"{}\" media-type=\"{}\"/>", i.id, escape_xml(&i.href), i.media_type));
    }
    let spine: Vec<String> = items.iter().map(|i| format!("<itemref idref=\"{}\"/>", i.id)).collect();
    let author = meta.author.as_deref().map(|a| format!("<dc:creator>{}</dc:creator>", escape_xml(a))).unwrap_or_default();
    let layout = if fixed { "<meta property=\"rendition:layout\">pre-paginated</meta><meta property=\"rendition:spread\">none</meta>" } else { "" };
    let lang = escape_xml(&meta.lang);
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\" xml:lang=\"{lang}\">
  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">
    <dc:identifier id=\"bookid\">urn:uuid:{id}</dc:identifier>
    <dc:title>{}</dc:title>
    <dc:language>{lang}</dc:language>
    {author}
    <meta property=\"dcterms:modified\">{modified}</meta>
    {layout}
  </metadata>
  <manifest>
    {}
  </manifest>
  <spine>
    {}
  </spine>
</package>", escape_xml(&meta.title), manifest.join("\n    "), spine.join("\n    "))
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::other(format!("zip: {e}"))
}

/// Zip with `mimetype` first and stored, then everything else deflated.
fn pack(files: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).compression_level(Some(6));
    zip.start_file("mimetype", stored).map_err(zip_err)?;
    zip.write_all(b"application/epub+zip")?;
    zip.start_file("META-INF/container.xml", deflated).map_err(zip_err)?;
    zip.write_all(CONTAINER_XML.as_bytes())?;
    for (path, data) in files {
        zip.start_file(path, deflated).map_err(zip_err)?;
        zip.write_all(&data)?;
    }
    Ok(zip.finish().map_err(zip_err)?.into_inner())
}

/// Reflowable book: one XHTML file per chapter.
pub fn build_reflow_epub(meta: &EpubMeta, chapters: &[Chapter]) -> Result<Vec<u8>> {
    let items: Vec<ManifestItem> = (1..=chapters.len())
        .map(|i| ManifestItem { id: format!("c{i:03}"), href: format!("c{i:03}.xhtml"), media_type: "application/xhtml+xml" })
        .collect();
    let nav: Vec<(String, String)> = items.iter().zip(chapters).map(|(i, c)| (i.href.clone(), c.title.clone())).collect();
    let mut files = vec![
        ("OEBPS/style.css".to_string(), STYLE_CSS.as_bytes().to_vec()),
        ("OEBPS/nav.xhtml".to_string(), nav_xhtml(&meta.title, &nav).into_bytes()),
    ];
    for (i, c) in items.iter().zip(chapters) {
        files.push((format!("OEBPS/{}", i.href), chapter_xhtml(&c.title, &c.body_xhtml, &meta.lang).into_bytes()));
    }
    files.push(("OEBPS/content.opf".to_string(), opf_xml(meta, false, &items, &[]).into_bytes()));
    pack(files)
}

/// Fixed-layout book: one full-page picture per page.
pub fn build_fixed_epub(meta: &EpubMeta, pages: &[FixedPage]) -> Result<Vec<u8>> {
    let n: Vec<String> = (1..=pages.len()).map(|i| format!("{i:03}")).collect();
    let items: Vec<ManifestItem> = n.iter().map(|k| ManifestItem { id: format!("p{k}"), href: format!("p{k}.xhtml"), media_type: "application/xhtml+xml" }).collect();
    let images: Vec<ManifestItem> = n.iter().map(|k| ManifestItem { id: format!("p{k}-img"), href: format!("images/p{k}.jpg"), media_type: "image/jpeg" }).collect();
    let nav: Vec<(String, String)> = items.iter().enumerate().map(|(i, it)| (it.href.clone(), format!("Page {}", i + 1))).collect();
    let mut files = vec![("OEBPS/nav.xhtml".to_string(), nav_xhtml(&meta.title, &nav).into_bytes())];
    for (img, p) in images.iter().zip(pages) {
        files.push((format!("OEBPS/{}", img.href), p.jpeg.clone()));
    }
    for (i, ((it, img), p)) in items.iter().zip(&images).zip(pages).enumerate() {
        files.push((format!("OEBPS/{}", it.href), fixed_page_xhtml(&format!("Page {}", i + 1), &img.href, p.width, p.height).into_bytes()));
    }
    files.push(("OEBPS/content.opf".to_string(), opf_xml(meta, true, &items, &images).into_bytes()));
    pack(files)
}
