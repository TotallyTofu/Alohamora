//! Port of src/main/selftest/cases/tools-image.ts.

use alohamora_core::types::ToolId;
use serde_json::{json, Value};

use super::{tool_case, tool_error, Case};
use crate::selftest::assert::{check, expect_count, Check};
use crate::selftest::fixtures_docs::{exif_summary, expect_image, expect_pdf_pages, image_dims, image_format, pixel};

fn case(name: &str, fixtures: &[&'static str], tool: ToolId, options: Value, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    tool_case(&format!("tools.image.{name}"), "tools.image", fixtures, tool, options, verify)
}

pub fn cases() -> Vec<Case> {
    vec![
        case("compress-jpg", &["photo.jpg"], ToolId::ImageCompress, json!({ "quality": 40 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "jpeg", None)?;
            // The source is the fixture next to the out/ folder: <root>/fixtures/photo.jpg.
            let out = std::path::Path::new(&o[0]);
            let root = out.ancestors().find(|p| p.join("fixtures").is_dir()).ok_or("fixtures folder not found")?;
            let source = std::fs::metadata(root.join("fixtures").join("photo.jpg")).map_err(|e| e.to_string())?.len();
            let size = std::fs::metadata(out).map_err(|e| e.to_string())?.len();
            check(size < source, format!("compressed ({size}) should be smaller than the source ({source})"))
        }),
        case("compress-png", &["image.png"], ToolId::ImageCompress, json!({}), |o| {
            // either a PNG was written, or the output was dropped because it was not smaller; both are fine, an error is not
            check(o.len() <= 1, format!("expected 0 or 1 outputs, got {}", o.len()))?;
            if o.len() == 1 { expect_image(&o[0], "png", None) } else { Ok(()) }
        }),
        case("resize-50", &["image.png"], ToolId::ImageResize, json!({ "mode": "percent", "percent": 50 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((400, 300)))
        }),
        case("crop-rect", &["image.png"], ToolId::ImageCrop, json!({ "rect": { "x": 0, "y": 0, "w": 0.5, "h": 0.5 } }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((400, 300)))
        }),
        case("crop-rotate", &["image.png"], ToolId::ImageCrop, json!({ "rotate": 90 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((600, 800)))
        }),
        case("edit-bw-keeps-alpha", &["image.png"], ToolId::ImageEdit, json!({ "exposure": 0.5, "effect": "bw" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", None)?;
            check(pixel(&o[0], 0, 0)?[3] == 0, "transparent corner should stay transparent")
        }),
        case("edit-sepia-jpg", &["photo.jpg"], ToolId::ImageEdit, json!({ "effect": "sepia" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "jpeg", None)
        }),
        case("background", &["image.png"], ToolId::ImageBackground, json!({}), |o| {
            expect_count(o, 1)?;
            let f = image_format(&o[0])?;
            let (w, h) = image_dims(&o[0])?;
            check(f == "png" && w > 800 && h > 600, format!("backdrop should be larger than 800x600, got {w}x{h}"))
        }),
        case("redact-black", &["photo.jpg"], ToolId::ImageRedact, json!({ "regions": [{ "rect": { "x": 0, "y": 0, "w": 0.25, "h": 0.25 }, "style": "black" }] }), |o| {
            expect_count(o, 1)?;
            let p = pixel(&o[0], 5, 5)?;
            check((p[0] as u32 + p[1] as u32 + p[2] as u32) < 30, format!("pixel (5,5) should be near black, got {},{},{}", p[0], p[1], p[2]))
        }),
        tool_error("tools.image.redact-empty-fails", "tools.image", &["photo.jpg"], ToolId::ImageRedact, json!({}), "at least one box"),
        case("metadata-remove-all", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "remove-all" }), |o| {
            expect_count(o, 1)?;
            let (artist, gps, _) = exif_summary(&o[0]);
            check(artist.is_none(), "Artist should be gone")?;
            check(!gps, "GPS should be gone")
        }),
        case("metadata-remove-gps", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "remove-gps" }), |o| {
            expect_count(o, 1)?;
            let (artist, gps, _) = exif_summary(&o[0]);
            check(artist.as_deref() == Some("Tester"), format!("Artist should survive, got {artist:?}"))?;
            check(!gps, "GPS should be gone")
        }),
        case("metadata-edit", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "edit", "fields": { "artist": "New" } }), |o| {
            expect_count(o, 1)?;
            let (artist, _, _) = exif_summary(&o[0]);
            check(artist.as_deref() == Some("New"), format!("Artist should be New, got {artist:?}"))
        }),
        case("metadata-remove-all-png", &["image.png"], ToolId::ImageMetadata, json!({ "action": "remove-all" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((800, 600)))
        }),
        case("collage-grid", &["image.png", "photo.jpg", "image.webp"], ToolId::ImageCollage, json!({ "layout": "grid" }), |o| {
            expect_count(o, 1)?;
            let f = image_format(&o[0])?;
            let (w, _) = image_dims(&o[0])?;
            check(f == "jpeg" && w == 2048, format!("expected a 2048 px wide JPEG, got {f} {w}"))
        }),
        case("make-pdf", &["image.png", "photo.jpg"], ToolId::ImagePdf, json!({ "pageSize": "a4", "combine": true }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 2)
        }),
    ]
}
