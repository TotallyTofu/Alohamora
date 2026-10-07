//! EXIF/ICC handling (replaces sharp `withMetadata`, piexifjs and exifr).
//! img-parts moves the raw EXIF/ICC blocks between files; kamadak-exif reads and rebuilds EXIF.

use std::io::Cursor;
use std::path::Path;

use exif::{Field, In, Tag, Value};
use img_parts::{Bytes, DynImage, ImageEXIF, ImageICC};

use super::encode::SaveFmt;
use crate::{AppError, Result};

/// EXIF (raw TIFF bytes, no "Exif\0\0" prefix) and ICC profile of a source file.
#[derive(Debug, Clone, Default)]
pub struct SourceMeta {
    pub exif: Option<Vec<u8>>,
    pub icc: Option<Vec<u8>>,
}

/// Read EXIF/ICC from a JPEG, PNG or WebP. Other formats (and unreadable files) give an empty result.
pub fn read_source_meta(path: &Path) -> SourceMeta {
    let Ok(bytes) = std::fs::read(path) else { return SourceMeta::default() };
    match DynImage::from_bytes(Bytes::from(bytes)) {
        Ok(Some(img)) => SourceMeta { exif: img.exif().map(|b| b.to_vec()), icc: img.icc_profile().map(|b| b.to_vec()) },
        _ => SourceMeta::default(),
    }
}

/// Put EXIF (orientation forced to 1, because pixels are already upright) and ICC into an encoded JPEG/PNG/WebP.
/// AVIF/TIFF/BMP outputs are returned unchanged.
pub fn attach(encoded: Vec<u8>, fmt: SaveFmt, meta: &SourceMeta) -> Result<Vec<u8>> {
    if !matches!(fmt, SaveFmt::Jpg | SaveFmt::Png | SaveFmt::Webp) || (meta.exif.is_none() && meta.icc.is_none()) {
        return Ok(encoded);
    }
    let Some(mut img) = DynImage::from_bytes(Bytes::from(encoded.clone())).map_err(AppError::other)? else {
        return Ok(encoded);
    };
    if let Some(e) = &meta.exif {
        let mut e = e.clone();
        alohamora_core::image_meta::reset_exif_orientation(&mut e);
        img.set_exif(Some(Bytes::from(e)));
    }
    // Our encoders write RGB pixels (or grey PNGs). A CMYK or grey profile from the source would describe the wrong data.
    let grey_png = matches!(fmt, SaveFmt::Png) && matches!(encoded.get(25), Some(0) | Some(4)); // IHDR colour type
    if let Some(icc) = meta.icc.as_ref().filter(|p| is_rgb_profile(p) && !grey_png) {
        img.set_icc_profile(Some(Bytes::from(icc.clone())));
    }
    let mut out = Vec::new();
    img.encoder().write_to(&mut out)?;
    Ok(out)
}

/// True for an ICC profile whose data colour space (header bytes 16..20) is RGB.
fn is_rgb_profile(icc: &[u8]) -> bool {
    icc.get(16..20) == Some(b"RGB ".as_slice())
}

/// EXIF Orientation of a file (1 when missing).
pub fn orientation(path: &Path) -> u32 {
    let Ok(f) = std::fs::File::open(path) else { return 1 };
    let Ok(exif) = exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)) else { return 1 };
    exif.get_field(Tag::Orientation, In::PRIMARY).and_then(|f| f.value.get_uint(0)).unwrap_or(1)
}

/// Artist, Copyright and ImageDescription from IFD0 (empty strings when missing).
pub fn text_fields(path: &Path) -> (String, String, String) {
    let read = || -> Option<exif::Exif> {
        let f = std::fs::File::open(path).ok()?;
        exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)).ok()
    };
    let Some(exif) = read() else { return (String::new(), String::new(), String::new()) };
    let get = |tag: Tag| -> String {
        match exif.get_field(tag, In::PRIMARY).map(|f| &f.value) {
            Some(Value::Ascii(v)) => v.iter().map(|s| String::from_utf8_lossy(s).trim_end_matches('\0').to_string()).collect::<Vec<_>>().join(" "),
            _ => String::new(),
        }
    };
    (get(Tag::Artist), get(Tag::Copyright), get(Tag::ImageDescription))
}

fn ascii(tag: Tag, ifd: In, s: &str) -> Field {
    Field { tag, ifd_num: ifd, value: Value::Ascii(vec![s.as_bytes().to_vec()]) }
}

/// Rebuild EXIF from `fields`: drops GPS, the thumbnail (IFD1) and MakerNote, then applies `replace`.
fn rebuild(raw: Option<Vec<u8>>, replace: &[Field]) -> Result<Vec<u8>> {
    let parsed = raw.and_then(|r| exif::Reader::new().read_raw(r).ok());
    let little_endian = parsed.as_ref().map(|e| e.little_endian()).unwrap_or(false);
    let mut keep: Vec<Field> = Vec::new();
    if let Some(e) = &parsed {
        for f in e.fields() {
            let is_gps = f.tag.context() == exif::Context::Gps;
            let dropped = is_gps || f.ifd_num != In::PRIMARY || f.tag == Tag::MakerNote
                || replace.iter().any(|r| r.tag == f.tag && r.ifd_num == f.ifd_num);
            if !dropped {
                keep.push(f.clone());
            }
        }
    }
    keep.extend(replace.iter().cloned());
    let mut w = exif::experimental::Writer::new();
    for f in &keep {
        w.push_field(f);
    }
    let mut out = Cursor::new(Vec::new());
    w.write(&mut out, little_endian).map_err(|e| AppError::tool("Could not write the photo information", e.to_string()))?;
    Ok(out.into_inner())
}

fn with_new_exif(jpeg: &[u8], exif: Vec<u8>) -> Result<Vec<u8>> {
    let mut img = img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg.to_vec()))
        .map_err(|e| AppError::user_with(super::MSG_UNREADABLE, e.to_string()))?;
    img.set_exif(Some(Bytes::from(exif)));
    let mut out = Vec::new();
    img.encoder().write_to(&mut out)?;
    Ok(out)
}

fn jpeg_exif(jpeg: &[u8]) -> Option<Vec<u8>> {
    img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg.to_vec())).ok()?.exif().map(|b| b.to_vec())
}

/// Lossless: same JPEG without GPS (port of `jpegRemoveGps`).
pub fn jpeg_remove_gps(jpeg: &[u8]) -> Result<Vec<u8>> {
    with_new_exif(jpeg, rebuild(jpeg_exif(jpeg), &[])?)
}

/// Fields for `jpeg_edit_fields`. `None` = leave unchanged. `date_taken` is "YYYY:MM:DD HH:MM:SS".
#[derive(Debug, Clone, Default)]
pub struct EditFields {
    pub artist: Option<String>,
    pub copyright: Option<String>,
    pub description: Option<String>,
    pub date_taken: Option<String>,
}

/// Lossless: same JPEG with new text fields (port of `jpegEditFields`). GPS is dropped as in the Electron build.
pub fn jpeg_edit_fields(jpeg: &[u8], f: &EditFields) -> Result<Vec<u8>> {
    let mut replace = Vec::new();
    if let Some(v) = &f.artist { replace.push(ascii(Tag::Artist, In::PRIMARY, v)); }
    if let Some(v) = &f.copyright { replace.push(ascii(Tag::Copyright, In::PRIMARY, v)); }
    if let Some(v) = &f.description { replace.push(ascii(Tag::ImageDescription, In::PRIMARY, v)); }
    if let Some(v) = f.date_taken.as_deref().filter(|v| !v.is_empty()) { replace.push(ascii(Tag::DateTimeOriginal, In::PRIMARY, v)); }
    with_new_exif(jpeg, rebuild(jpeg_exif(jpeg), &replace)?)
}

/// A fresh EXIF block with only the given IFD0 text fields (empty strings are skipped).
pub fn text_only_exif(artist: &str, copyright: &str, description: &str) -> Result<Option<Vec<u8>>> {
    let mut fields = Vec::new();
    if !artist.is_empty() { fields.push(ascii(Tag::Artist, In::PRIMARY, artist)); }
    if !copyright.is_empty() { fields.push(ascii(Tag::Copyright, In::PRIMARY, copyright)); }
    if !description.is_empty() { fields.push(ascii(Tag::ImageDescription, In::PRIMARY, description)); }
    if fields.is_empty() {
        return Ok(None);
    }
    Ok(Some(rebuild(None, &fields)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_rgb_profiles_are_kept() {
        let mut icc = vec![0u8; 128];
        icc[16..20].copy_from_slice(b"RGB ");
        assert!(is_rgb_profile(&icc));
        icc[16..20].copy_from_slice(b"CMYK");
        assert!(!is_rgb_profile(&icc));
        assert!(!is_rgb_profile(b"short"));
    }
}
