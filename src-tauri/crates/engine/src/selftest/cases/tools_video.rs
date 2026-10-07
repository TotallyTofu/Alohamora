//! Port of src/main/selftest/cases/tools-video.ts.

use std::path::Path;

use alohamora_core::types::ToolId;
use serde_json::json;

use super::{tool_case, tool_error, Case};
use crate::ffmpeg::probe;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};
use crate::selftest::fixtures_docs::expect_image;

const G: &str = "tools.video";

fn n(name: &str) -> String {
    format!("tools.video.{name}")
}

fn p(file: &str) -> Result<alohamora_core::ffmpeg_parse::ProbeResult, String> {
    probe(Path::new(file)).map_err(|e| e.to_string())
}

pub fn cases() -> Vec<Case> {
    vec![
        tool_case(&n("compress"), G, &["video.mp4"], ToolId::VideoCompress, json!({ "preset": "small", "maxHeight": 240 }), |o| {
            expect_count(o, 1)?;
            let v = p(&o[0])?.video.ok_or("no video")?;
            check(v.display_height == 240, format!("expected height 240, got {}", v.display_height))?;
            check(v.codec == "h264", format!("expected h264, got {}", v.codec))
        }),
        tool_case(&n("trim-precise"), G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 3, "precise": true }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((2.0, 0.25)))
        }),
        tool_case(&n("trim-fast"), G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 3, "precise": false }), |o| {
            expect_count(o, 1)?;
            let d = p(&o[0])?.duration_sec;
            check((1.5..=3.3).contains(&d), format!("fast trim duration should be 1.5–3.3 s, got {d}"))
        }),
        tool_case(&n("split-parts"), G, &["video.mp4"], ToolId::VideoSplit, json!({ "mode": "parts", "parts": 2 }), |o| expect_count(o, 2)),
        tool_case(&n("crop"), G, &["video.mp4"], ToolId::VideoCrop, json!({ "rect": { "x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5 } }), |o| {
            expect_count(o, 1)?;
            let v = p(&o[0])?.video.ok_or("no video")?;
            check(v.display_width == 320 && v.display_height == 180, format!("expected 320x180, got {}x{}", v.display_width, v.display_height))
        }),
        tool_error(&n("crop-full-rect-fails"), G, &["video.mp4"], ToolId::VideoCrop, json!({}), "whole frame"),
        tool_case(&n("speed-2x"), G, &["video.mp4"], ToolId::VideoSpeed, json!({ "factor": 2, "keepAudio": true }), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            check((r.duration_sec - 2.0).abs() <= 0.3, format!("expected ~2 s, got {}", r.duration_sec))?;
            check(r.audio.is_some(), "audio should be kept")
        }),
        tool_case(&n("mute"), G, &["video.mp4"], ToolId::VideoMute, json!({}), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::None, None)
        }),
        tool_case(&n("snapshot-single"), G, &["video.mp4"], ToolId::VideoSnapshot, json!({ "mode": "single", "timeSec": 1, "format": "png" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((640, 360)))
        }),
        tool_case(&n("snapshot-every"), G, &["video.mp4"], ToolId::VideoSnapshot, json!({ "mode": "every", "everySec": 1, "format": "jpg" }), |o| {
            check(o.len() == 4 || o.len() == 5, format!("expected 4 or 5 frames, got {}", o.len()))
        }),
        tool_case(&n("redact-blur"), G, &["video.mp4"], ToolId::VideoRedact, json!({ "regions": [{ "rect": { "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3 }, "style": "blur" }] }), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            let v = r.video.ok_or("no video")?;
            check(v.codec == "h264" && v.display_width == 640 && v.display_height == 360, "redacted video should stay h264 640x360")?;
            check(!r.tags.contains_key("title"), "metadata should have been stripped")
        }),
        tool_case(&n("metadata-set-title"), G, &["video.mp4"], ToolId::VideoMetadata, json!({ "tags": { "title": "Hello" } }), |o| {
            expect_count(o, 1)?;
            check(p(&o[0])?.tags.get("title").map(|s| s.as_str()) == Some("Hello"), "title tag should be Hello")
        }),
        tool_case(&n("metadata-remove-all"), G, &["titled.mp4"], ToolId::VideoMetadata, json!({ "removeAll": true }), |o| {
            expect_count(o, 1)?;
            check(!p(&o[0])?.tags.contains_key("title"), "title tag should be gone")
        }),
        tool_case(&n("join-same"), G, &["video.mp4", "video-copy.mp4"], ToolId::VideoJoin, json!({}), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), Some((8.0, 0.3)))
        }),
        tool_case(&n("join-mixed"), G, &["video.mp4", "video-noaudio.mp4"], ToolId::VideoJoin, json!({}), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            check((r.duration_sec - 6.0).abs() <= 0.4, format!("expected ~6 s, got {}", r.duration_sec))?;
            check(r.audio.is_some(), "joined clip should have audio")
        }),
    ]
}
