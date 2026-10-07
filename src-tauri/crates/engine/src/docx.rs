//! Minimal DOCX writer (port of docxWriter.ts). A DOCX is a zip of XML parts; we write only what Word,
//! LibreOffice and Pages need: content types, relationships, styles (Heading1–3), bullet numbering,
//! core properties, the document body and the pictures.

use std::io::{Cursor, Write};

use alohamora_core::pdf_reflow::{Block, BlockKind, Run};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::pdf::create::{EmbedKind, EmbeddableImage};
use crate::{AppError, Result};

/// EMU (English Metric Units) per pixel at 96 DPI.
const EMU_PER_PX: u64 = 9525;
/// A4 in twips with 1-inch margins (the docx npm package default).
const A4_SECTION: &str = r#"<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>"#;

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>"#;

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>"#;

const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>"#;

const NUMBERING: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>"#;

/// Escape for XML text and drop characters XML 1.0 forbids (PDF text often contains control characters).
fn xml_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\t' | '\n' | '\r' => out.push(' '),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => out.push(c),
        }
    }
    out
}

/// Collects the body and the pictures, then zips everything.
struct DocxBuilder {
    body: String,
    media: Vec<(String, Vec<u8>)>,
    title: String,
}

impl DocxBuilder {
    fn new(title: &str) -> Self {
        DocxBuilder { body: String::new(), media: Vec::new(), title: title.to_string() }
    }

    /// Add a picture to the package and return its inline-drawing run XML.
    fn picture_run(&mut self, data: &[u8], kind: EmbedKind, width_px: u64, height_px: u64) -> String {
        let n = self.media.len() + 1;
        let ext = if kind == EmbedKind::Png { "png" } else { "jpeg" };
        self.media.push((format!("image{n}.{ext}"), data.to_vec()));
        let (cx, cy) = (width_px * EMU_PER_PX, height_px * EMU_PER_PX);
        format!(
            r#"<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{n}" name="Picture {n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="image{n}.{ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg{n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"#
        )
    }

    fn page_break(&mut self) {
        self.body.push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
    }

    fn runs_xml(runs: &[Run]) -> String {
        runs.iter()
            .map(|r| {
                let mut props = String::new();
                if r.bold { props.push_str("<w:b/>"); }
                if r.italic { props.push_str("<w:i/>"); }
                let rpr = if props.is_empty() { String::new() } else { format!("<w:rPr>{props}</w:rPr>") };
                format!(r#"<w:r>{rpr}<w:t xml:space="preserve">{}</w:t></w:r>"#, xml_text(&r.text))
            })
            .collect()
    }

    /// Zip the package. `final_section` is the body's last sectPr.
    fn finish(self, final_section: &str) -> Result<Vec<u8>> {
        let document = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>{}{final_section}</w:body></w:document>"#,
            self.body
        );
        let mut rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>"#);
        for (i, (name, _)) in self.media.iter().enumerate() {
            rels.push_str(&format!(
                r#"<Relationship Id="rIdImg{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/>"#,
                i + 1
            ));
        }
        rels.push_str("</Relationships>");
        let created = alohamora_core::time::iso_utc(alohamora_core::time::unix_now());
        let core = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{}</dc:title><dc:creator>Alohamora</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{created}</dcterms:modified></cp:coreProperties>"#,
            xml_text(&self.title)
        );

        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let zerr = |e: zip::result::ZipError| AppError::other(format!("zip: {e}"));
        let mut parts: Vec<(String, Vec<u8>)> = vec![
            ("[Content_Types].xml".into(), CONTENT_TYPES.as_bytes().to_vec()),
            ("_rels/.rels".into(), ROOT_RELS.as_bytes().to_vec()),
            ("docProps/core.xml".into(), core.into_bytes()),
            ("word/document.xml".into(), document.into_bytes()),
            ("word/_rels/document.xml.rels".into(), rels.into_bytes()),
            ("word/styles.xml".into(), STYLES.as_bytes().to_vec()),
            ("word/numbering.xml".into(), NUMBERING.as_bytes().to_vec()),
        ];
        for (name, data) in self.media {
            parts.push((format!("word/media/{name}"), data));
        }
        for (name, data) in parts {
            zip.start_file(name, opts).map_err(zerr)?;
            zip.write_all(&data)?;
        }
        Ok(zip.finish().map_err(zerr)?.into_inner())
    }
}

/// One picture per page, scaled to fit 6.5 × 9 inches (624 × 864 px at 96 DPI), centred.
pub fn images_to_docx(images: &[EmbeddableImage]) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new("");
    for (i, img) in images.iter().enumerate() {
        let k = (624.0 / img.width as f64).min(864.0 / img.height as f64).min(1.0);
        let (w, h) = ((img.width as f64 * k).round() as u64, (img.height as f64 * k).round() as u64);
        let run = b.picture_run(&img.data, img.kind, w, h);
        b.body.push_str(&format!(r#"<w:p><w:pPr><w:jc w:val="center"/></w:pPr>{run}</w:p>"#));
        if i + 1 < images.len() {
            b.page_break();
        }
    }
    b.finish(A4_SECTION)
}

/// Reflowed text: headings use Heading1–3, list items use bullets, paragraphs get 8 pt after.
pub fn blocks_to_docx(blocks: &[Block], title: &str) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new(title);
    for block in blocks {
        match block {
            Block::PageBreak => b.page_break(),
            Block::Text { kind, runs } => {
                let ppr = match kind {
                    BlockKind::H1 => r#"<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>"#,
                    BlockKind::H2 => r#"<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>"#,
                    BlockKind::H3 => r#"<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>"#,
                    BlockKind::Li => r#"<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>"#,
                    BlockKind::P => r#"<w:pPr><w:spacing w:after="160"/></w:pPr>"#,
                };
                b.body.push_str(&format!("<w:p>{ppr}{}</w:p>", DocxBuilder::runs_xml(runs)));
            }
        }
    }
    b.finish(A4_SECTION)
}

fn page_section(w_pt: f64, h_pt: f64) -> String {
    let (w, h) = ((w_pt * 20.0).round() as i64, (h_pt * 20.0).round() as i64);
    let orient = if w > h { r#" w:orient="landscape""# } else { "" };
    format!(r#"<w:sectPr><w:pgSz w:w="{w}" w:h="{h}"{orient}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>"#)
}

/// "Exact look": each PDF page becomes a full-page picture in its own section (page size = PDF page size).
pub fn page_images_to_docx(pages: &[(Vec<u8>, f64, f64)]) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new("");
    for (i, (jpeg, w_pt, h_pt)) in pages.iter().enumerate() {
        let w = (w_pt * 96.0 / 72.0 * 0.98).round() as u64;
        let h = (h_pt * 96.0 / 72.0 * 0.98).round() as u64;
        let run = b.picture_run(jpeg, EmbedKind::Jpeg { components: 3 }, w, h);
        // A section ends with the paragraph that carries its sectPr; the last section's sectPr closes the body.
        let ppr = if i + 1 < pages.len() { format!("<w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/>{}</w:pPr>", page_section(*w_pt, *h_pt)) } else { r#"<w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>"#.to_string() };
        b.body.push_str(&format!("<w:p>{ppr}{run}</w:p>"));
    }
    let last = pages.last().map(|(_, w, h)| page_section(*w, *h)).unwrap_or_else(|| A4_SECTION.to_string());
    b.finish(&last)
}
