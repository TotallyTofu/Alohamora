//! Build new PDFs from pictures with lopdf (port of imagesToPdf / pageImagesToPdf / embeddableImage).

use std::path::Path;

use alohamora_core::image_meta::jpeg_sof_info;
use alohamora_core::options::{PdfMargin, PdfPageSize};
use alohamora_core::types::{FileInfo, Fmt};
use lopdf::{dictionary, Document, Object, ObjectId, Stream};

use crate::cancel::CancelToken;
use crate::{AppError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedKind {
    /// JPEG bytes used as-is; `components` 1 = grey, 3 = colour.
    Jpeg { components: u8 },
    /// PNG bytes (only for pictures with transparency).
    Png,
}

/// A picture ready to put into a PDF or DOCX.
#[derive(Debug, Clone)]
pub struct EmbeddableImage {
    pub kind: EmbedKind,
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Original JPEG bytes when safe (upright, grey or colour); otherwise re-encode (PNG only if transparent).
pub fn embeddable_image(file: &FileInfo) -> Result<EmbeddableImage> {
    let path = Path::new(&file.path);
    if file.fmt == Some(Fmt::Jpg) {
        let bytes = std::fs::read(path)?;
        if let Some((w, h, c)) = jpeg_sof_info(&bytes) {
            if (c == 1 || c == 3) && w > 0 && h > 0 && crate::image::exif::orientation(path) == 1 {
                return Ok(EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: bytes, width: w, height: h });
            }
        }
    }
    let img = crate::image::load(path, file.fmt)?;
    let opaque = !img.color().has_alpha() || img.to_rgba8().pixels().all(|p| p[3] == 255);
    if opaque {
        let data = crate::image::encode::jpeg_bytes(&img, 92.0)?;
        Ok(EmbeddableImage { kind: EmbedKind::Jpeg { components: 3 }, data, width: img.width(), height: img.height() })
    } else {
        let data = crate::image::encode::png_bytes(&img)?;
        Ok(EmbeddableImage { kind: EmbedKind::Png, data, width: img.width(), height: img.height() })
    }
}

/// Tesseract's glyph-less font (tessdata/pdf.ttf, Apache-2.0): one empty glyph.
const GLYPHLESS_TTF: &[u8] = include_bytes!("../../assets/glyphless.ttf");

/// CID = UTF-16 code unit, so the identity map gives the text back.
const TO_UNICODE: &str = "/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identify-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
";

/// One recognised word: its box in page-picture pixels and its text.
#[derive(Debug, Clone)]
pub struct OcrWord {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    pub text: String,
}

/// A page for a searchable PDF: the page picture (JPEG) at `dpi` and the words found on it.
pub struct SearchablePage {
    pub jpeg: Vec<u8>,
    pub width_px: u32,
    pub height_px: u32,
    pub dpi: f64,
    pub words: Vec<OcrWord>,
}

/// Collects pages; each page shows one picture.
pub struct PdfBuilder {
    doc: Document,
    pages_id: ObjectId,
    kids: Vec<Object>,
    /// The invisible-text font, created on first use by `add_searchable_page`.
    glyphless: Option<ObjectId>,
}

impl Default for PdfBuilder {
    fn default() -> Self {
        Self::new()
    }
}

fn num(v: f64) -> String {
    let s = format!("{v:.4}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

impl PdfBuilder {
    pub fn new() -> Self {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();
        PdfBuilder { doc, pages_id, kids: Vec::new(), glyphless: None }
    }

    fn image_xobject(&mut self, img: &EmbeddableImage) -> Result<ObjectId> {
        let (w, h) = (img.width as i64, img.height as i64);
        match img.kind {
            EmbedKind::Jpeg { components } => {
                let cs = if components == 1 { "DeviceGray" } else { "DeviceRGB" };
                let dict = dictionary! {
                    "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h,
                    "ColorSpace" => cs, "BitsPerComponent" => 8, "Filter" => "DCTDecode",
                };
                Ok(self.doc.add_object(Stream::new(dict, img.data.clone()).with_compression(false)))
            }
            EmbedKind::Png => {
                let rgba = image::load_from_memory(&img.data).map_err(crate::image::unreadable)?.to_rgba8();
                let mut rgb = Vec::with_capacity(rgba.len() / 4 * 3);
                let mut alpha = Vec::with_capacity(rgba.len() / 4);
                for p in rgba.pixels() {
                    rgb.extend_from_slice(&p.0[..3]);
                    alpha.push(p[3]);
                }
                let mut mask = Stream::new(
                    dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h, "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8 },
                    alpha,
                );
                mask.compress().map_err(AppError::other)?;
                let mask_id = self.doc.add_object(mask);
                let mut s = Stream::new(
                    dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "SMask" => mask_id },
                    rgb,
                );
                s.compress().map_err(AppError::other)?;
                Ok(self.doc.add_object(s))
            }
        }
    }

    /// Add a `page_w` × `page_h` pt page with the picture drawn at (x, y) with size (w, h), PDF coordinates (origin bottom-left).
    #[allow(clippy::too_many_arguments)]
    pub fn add_image_page(&mut self, img: &EmbeddableImage, page_w: f64, page_h: f64, x: f64, y: f64, w: f64, h: f64) -> Result<()> {
        let img_id = self.image_xobject(img)?;
        let ops = format!("q {} 0 0 {} {} {} cm /Im0 Do Q", num(w), num(h), num(x), num(y));
        let content_id = self.doc.add_object(Stream::new(dictionary! {}, ops.into_bytes()));
        let page_id = self.doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => self.pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(page_w as f32), Object::Real(page_h as f32)],
            "Contents" => content_id,
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => img_id } },
        });
        self.kids.push(page_id.into());
        Ok(())
    }

    /// Tesseract's trick for searchable PDFs: a font whose every character is one blank glyph (glyph 1,
    /// 500/1000 em wide), Identity-H encoding with UTF-16 codes, and a ToUnicode map so copy/search work.
    fn glyphless_font(&mut self) -> Result<ObjectId> {
        if let Some(id) = self.glyphless {
            return Ok(id);
        }
        let mut font_file = Stream::new(dictionary! { "Length1" => GLYPHLESS_TTF.len() as i64 }, GLYPHLESS_TTF.to_vec());
        font_file.compress().map_err(AppError::other)?;
        let font_file_id = self.doc.add_object(font_file);
        let descriptor = self.doc.add_object(dictionary! {
            "Type" => "FontDescriptor", "FontName" => "GlyphLessFont", "Flags" => 5,
            "FontBBox" => vec![0.into(), 0.into(), 500.into(), 1000.into()],
            "ItalicAngle" => 0, "Ascent" => 1000, "Descent" => -1, "CapHeight" => 1000, "StemV" => 80,
            "FontFile2" => font_file_id,
        });
        // Every CID (2 bytes) maps to glyph 1.
        let map: Vec<u8> = (0..65536).flat_map(|_| [0u8, 1u8]).collect();
        let mut map_stream = Stream::new(dictionary! {}, map);
        map_stream.compress().map_err(AppError::other)?;
        let map_id = self.doc.add_object(map_stream);
        let cid_font = self.doc.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "CIDFontType2", "BaseFont" => "GlyphLessFont",
            "CIDSystemInfo" => dictionary! { "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 },
            "FontDescriptor" => descriptor, "DW" => 500, "CIDToGIDMap" => map_id,
        });
        let to_unicode = self.doc.add_object(Stream::new(dictionary! {}, TO_UNICODE.as_bytes().to_vec()));
        let id = self.doc.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "GlyphLessFont", "Encoding" => "Identity-H",
            "DescendantFonts" => vec![cid_font.into()], "ToUnicode" => to_unicode,
        });
        self.glyphless = Some(id);
        Ok(id)
    }

    /// Page = the scanned picture + invisible, selectable text placed over each recognised word.
    pub fn add_searchable_page(&mut self, p: &SearchablePage) -> Result<()> {
        let k = 72.0 / p.dpi;
        let (page_w, page_h) = (p.width_px as f64 * k, p.height_px as f64 * k);
        let (w, h, c) = jpeg_sof_info(&p.jpeg).ok_or_else(|| AppError::other("OCR page picture is not a JPEG"))?;
        let img_id = self.image_xobject(&EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: p.jpeg.clone(), width: w, height: h })?;
        let font_id = self.glyphless_font()?;
        let mut ops = format!("q {} 0 0 {} 0 0 cm /Im0 Do Q\nBT 3 Tr\n", num(page_w), num(page_h));
        for word in &p.words {
            let units: Vec<u16> = word.text.encode_utf16().collect();
            if units.is_empty() || word.width <= 0.0 || word.height <= 0.0 {
                continue;
            }
            let size = (word.height * k).max(1.0);
            let natural = units.len() as f64 * 0.5 * size; // each glyph is 500/1000 em wide
            let stretch = 100.0 * word.width * k / natural;
            let hex: String = units.iter().map(|u| format!("{u:04X}")).collect();
            let (x, y) = (word.left * k, page_h - (word.top + word.height) * k);
            ops.push_str(&format!("/F1 {} Tf {} Tz 1 0 0 1 {} {} Tm <{hex}> Tj\n", num(size), num(stretch), num(x), num(y)));
        }
        ops.push_str("ET\n");
        let content_id = self.doc.add_object(Stream::new(dictionary! {}, ops.into_bytes()));
        let page_id = self.doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => self.pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(page_w as f32), Object::Real(page_h as f32)],
            "Contents" => content_id,
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => img_id }, "Font" => dictionary! { "F1" => font_id } },
        });
        self.kids.push(page_id.into());
        Ok(())
    }

    pub fn page_count(&self) -> usize {
        self.kids.len()
    }

    /// Finish and return the file bytes (object streams on, like pdf-lib's `useObjectStreams`).
    pub fn finish(mut self) -> Result<Vec<u8>> {
        let count = self.kids.len() as i64;
        self.doc.objects.insert(self.pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => self.kids, "Count" => count }));
        let catalog = self.doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => self.pages_id });
        self.doc.trailer.set("Root", catalog);
        self.doc.compress();
        let mut out = Vec::new();
        self.doc.save_modern(&mut out).map_err(AppError::other)?;
        Ok(out)
    }
}

const A4: (f64, f64) = (595.28, 841.89);
const LETTER: (f64, f64) = (612.0, 792.0);

fn margin_pt(m: PdfMargin) -> f64 {
    match m {
        PdfMargin::None => 0.0,
        PdfMargin::Small => 18.0,
        PdfMargin::Large => 36.0,
    }
}

/// Port of imagesToPdf: one page per picture. "fit" = picture size at 96 DPI (capped near A3).
pub fn images_to_pdf(
    files: &[FileInfo], page_size: PdfPageSize, margin: PdfMargin, out: &Path,
    on_progress: &dyn Fn(f64), cancel: &CancelToken,
) -> Result<()> {
    let m = margin_pt(margin);
    let mut b = PdfBuilder::new();
    for (i, f) in files.iter().enumerate() {
        cancel.check()?;
        let img = embeddable_image(f)?;
        let (iw, ih) = (img.width as f64, img.height as f64);
        let (pw, ph) = match page_size {
            PdfPageSize::Fit => {
                let k = (1190.0 / (iw * 0.75).max(ih * 0.75)).min(1.0);
                (iw * 0.75 * k + 2.0 * m, ih * 0.75 * k + 2.0 * m)
            }
            other => {
                let (a, c) = if other == PdfPageSize::A4 { A4 } else { LETTER };
                if iw > ih { (c, a) } else { (a, c) }
            }
        };
        let scale = ((pw - 2.0 * m) / iw).min((ph - 2.0 * m) / ih);
        let (w, h) = (iw * scale, ih * scale);
        b.add_image_page(&img, pw, ph, (pw - w) / 2.0, (ph - h) / 2.0, w, h)?;
        on_progress((i + 1) as f64 / files.len() as f64);
    }
    std::fs::write(out, b.finish()?)?;
    Ok(())
}

/// One page per JPEG, the picture filling the page (used by "Max" compression).
pub fn page_images_to_pdf(pages: &[(Vec<u8>, f64, f64)]) -> Result<Vec<u8>> {
    let mut b = PdfBuilder::new();
    for (jpeg, w_pt, h_pt) in pages {
        let (w, h, c) = jpeg_sof_info(jpeg).ok_or_else(|| AppError::other("rendered page is not a JPEG"))?;
        let img = EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: jpeg.clone(), width: w, height: h };
        b.add_image_page(&img, *w_pt, *h_pt, 0.0, 0.0, *w_pt, *h_pt)?;
    }
    b.finish()
}
