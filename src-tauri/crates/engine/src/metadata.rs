//! Port of metadata.ts: what the Metadata panels show (media tags, photo EXIF, PDF document info).

use std::path::Path;

use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::registry::{category_of, fmt_from_path};
use alohamora_core::types::{Category, MetadataField, MetadataInfo};
use exif::{In, Tag, Value};
use pdfium_render::prelude::*;

use crate::ffmpeg::{probe, run_ffmpeg_to_buffer};
use crate::fsutil::data_url;
use crate::paths::p2s;
use crate::{AppError, Result};

const VIDEO_KEYS: [(&str, &str); 5] = [("title", "Title"), ("artist", "Author"), ("comment", "Comment"), ("date", "Date"), ("description", "Description")];
const AUDIO_KEYS: [(&str, &str); 8] = [
    ("title", "Title"), ("artist", "Artist"), ("album", "Album"), ("album_artist", "Album artist"),
    ("date", "Year"), ("genre", "Genre"), ("track", "Track"), ("comment", "Comment"),
];
const READONLY: [(&str, &str); 5] = [
    ("encoder", "Encoder"), ("creation_time", "Created"), ("location", "Location"),
    ("com.apple.quicktime.location.iso6709", "Location"), ("com.apple.quicktime.model", "Camera"),
];

fn field(key: &str, label: &str, value: String, editable: bool) -> MetadataField {
    MetadataField { key: key.into(), label: label.into(), value, editable }
}

/// Read-only fields are only listed when they have a value.
fn push_ro(fields: &mut Vec<MetadataField>, key: &str, label: &str, value: String) {
    if !value.is_empty() {
        fields.push(field(key, label, value, false));
    }
}

pub fn read_media(p: &Path) -> Result<MetadataInfo> {
    let pr = probe(p)?;
    let audio = fmt_from_path(&p2s(p)).map(category_of) == Some(Category::Audio);
    let keys: &[(&str, &str)] = if audio { &AUDIO_KEYS } else { &VIDEO_KEYS };
    let mut fields: Vec<MetadataField> = keys.iter().map(|(k, l)| field(k, l, pr.tags.get(*k).cloned().unwrap_or_default(), true)).collect();
    for (k, l) in READONLY {
        push_ro(&mut fields, k, l, pr.tags.get(k).cloned().unwrap_or_default());
    }
    let cover = if pr.has_cover {
        let args: Vec<String> = ["-i", &p2s(p), "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=256:256:force_original_aspect_ratio=decrease",
            "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"].iter().map(|s| s.to_string()).collect();
        Some(data_url("image/jpeg", &run_ffmpeg_to_buffer(&args, None)?))
    } else {
        None
    };
    let has_gps = pr.tags.keys().any(|k| k.contains("location"));
    Ok(MetadataInfo { kind: "media".into(), fields, has_gps: Some(has_gps), has_cover: Some(pr.has_cover), cover_data_url: cover })
}

/// EXIF "2024:05:01 14:30:00" → "2024-05-01T14:30" (the format of <input type="datetime-local">).
fn local_input(v: &str) -> String {
    let b = v.as_bytes();
    if v.len() >= 16 && b[4] == b':' && b[7] == b':' {
        format!("{}-{}-{}T{}", &v[0..4], &v[5..7], &v[8..10], &v[11..16])
    } else {
        String::new()
    }
}

fn rational_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Rational(r) => r.first().map(|x| x.to_f64()),
        Value::SRational(r) => r.first().map(|x| x.to_f64()),
        Value::Short(s) => s.first().map(|x| *x as f64),
        Value::Long(l) => l.first().map(|x| *x as f64),
        _ => None,
    }
}

/// Degrees from the three GPS rationals and the N/S/E/W reference.
fn gps_degrees(e: &exif::Exif, value: Tag, reference: Tag) -> Option<f64> {
    let v = match &e.get_field(value, In::PRIMARY)?.value {
        Value::Rational(r) if r.len() >= 3 => r[0].to_f64() + r[1].to_f64() / 60.0 + r[2].to_f64() / 3600.0,
        _ => return None,
    };
    let r = e.get_field(reference, In::PRIMARY).map(|f| f.display_value().to_string()).unwrap_or_default();
    Some(if r.contains('S') || r.contains('W') { -v } else { v })
}

pub fn read_image(p: &Path) -> Result<MetadataInfo> {
    let parsed = std::fs::File::open(p).ok().and_then(|f| exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)).ok());
    let text = |tag: Tag| -> String {
        parsed.as_ref().and_then(|e| e.get_field(tag, In::PRIMARY)).map(|f| match &f.value {
            Value::Ascii(v) => v.iter().map(|s| String::from_utf8_lossy(s).trim_end_matches('\0').trim().to_string()).collect::<Vec<_>>().join(" "),
            other => other.display_as(tag).to_string(),
        }).unwrap_or_default()
    };
    let num = |tag: Tag| parsed.as_ref().and_then(|e| e.get_field(tag, In::PRIMARY)).and_then(|f| rational_f64(&f.value));
    let mut fields = Vec::new();
    push_ro(&mut fields, "make", "Camera make", text(Tag::Make));
    push_ro(&mut fields, "model", "Camera", text(Tag::Model));
    push_ro(&mut fields, "lens", "Lens", text(Tag::LensModel));
    fields.push(field("dateTaken", "Date taken", local_input(&text(Tag::DateTimeOriginal)), true));
    let exposure = num(Tag::ExposureTime).map(|t| if t < 1.0 { format!("1/{} s", js_round(1.0 / t)) } else { format!("{} s", js_num(t)) });
    push_ro(&mut fields, "exposure", "Exposure", exposure.unwrap_or_default());
    push_ro(&mut fields, "aperture", "Aperture", num(Tag::FNumber).map(|f| format!("f/{}", js_num(f))).unwrap_or_default());
    push_ro(&mut fields, "iso", "ISO", text(Tag::PhotographicSensitivity));
    push_ro(&mut fields, "focal", "Focal length", num(Tag::FocalLength).map(|f| format!("{} mm", js_num(f))).unwrap_or_default());
    push_ro(&mut fields, "software", "Software", text(Tag::Software));
    fields.push(field("artist", "Artist", text(Tag::Artist), true));
    fields.push(field("copyright", "Copyright", text(Tag::Copyright), true));
    fields.push(field("description", "Description", text(Tag::ImageDescription), true));
    let lat = parsed.as_ref().and_then(|e| gps_degrees(e, Tag::GPSLatitude, Tag::GPSLatitudeRef));
    let lon = parsed.as_ref().and_then(|e| gps_degrees(e, Tag::GPSLongitude, Tag::GPSLongitudeRef));
    let has_gps = lat.is_some() && lon.is_some();
    if let (Some(a), Some(b)) = (lat, lon) {
        fields.push(field("location", "Location", format!("{}, {}", js_to_fixed(a, 5), js_to_fixed(b, 5)), false));
    }
    Ok(MetadataInfo { kind: "image".into(), fields, has_gps: Some(has_gps), has_cover: None, cover_data_url: None })
}

/// "D:20240501143000+02'00'" → "2024-05-01 14:30:00" (shown as text; the UI does not parse it).
fn pdf_date(v: &str) -> String {
    let d = v.trim_start_matches("D:");
    if d.len() >= 14 && d[..14].chars().all(|c| c.is_ascii_digit()) {
        format!("{}-{}-{} {}:{}:{}", &d[0..4], &d[4..6], &d[6..8], &d[8..10], &d[10..12], &d[12..14])
    } else {
        v.to_string()
    }
}

pub fn read_pdf(p: &Path) -> Result<MetadataInfo> {
    let doc = crate::pdf::open(p)?;
    let get = |t: PdfDocumentMetadataTagType| doc.metadata().get(t).map(|v| v.value().to_string()).unwrap_or_default();
    let mut fields = vec![
        field("title", "Title", get(PdfDocumentMetadataTagType::Title), true),
        field("author", "Author", get(PdfDocumentMetadataTagType::Author), true),
        field("subject", "Subject", get(PdfDocumentMetadataTagType::Subject), true),
        field("keywords", "Keywords", get(PdfDocumentMetadataTagType::Keywords), true),
    ];
    let pages = doc.pages().len().to_string();
    push_ro(&mut fields, "creator", "Creator", get(PdfDocumentMetadataTagType::Creator));
    push_ro(&mut fields, "producer", "Producer", get(PdfDocumentMetadataTagType::Producer));
    push_ro(&mut fields, "created", "Created", pdf_date(&get(PdfDocumentMetadataTagType::CreationDate)));
    push_ro(&mut fields, "modified", "Modified", pdf_date(&get(PdfDocumentMetadataTagType::ModificationDate)));
    push_ro(&mut fields, "pages", "Pages", pages);
    Ok(MetadataInfo { kind: "pdf".into(), fields, has_gps: None, has_cover: None, cover_data_url: None })
}

/// Dispatch on the file's category (port of the meta:read handler).
pub fn read_metadata(p: &Path) -> Result<MetadataInfo> {
    match fmt_from_path(&p2s(p)).map(category_of) {
        Some(Category::Video) | Some(Category::Audio) => read_media(p),
        Some(Category::Image) => read_image(p),
        Some(Category::Pdf) => read_pdf(p),
        _ => Err(AppError::other("No metadata reader for this file type")),
    }
}
