//! Port of src/main/selftest/cases/errors.ts: each situation must show a plain-language message.

use alohamora_core::types::{Fmt, ToolId};
use serde_json::json;

use super::{convert_error, tool_error, Case};

const G: &str = "errors";

pub fn cases() -> Vec<Case> {
    let mut heic = convert_error("errors.heic-without-encoder", G, &["image.png"], Fmt::Heic, None, "HEIC output is not available");
    heic.skip = Some(|c| if c.heif_enc { Some("a HEIC encoder exists on this machine".into()) } else { None });
    vec![
        convert_error("errors.fake-video", G, &["fake.mp4"], Fmt::Mkv, None, "damaged|not really the format"),
        convert_error("errors.fake-audio", G, &["fake.mp3"], Fmt::Wav, None, "damaged|not really the format"),
        convert_error("errors.broken-image", G, &["broken.png"], Fmt::Jpg, None, "couldn't read this image"),
        convert_error("errors.broken-pdf", G, &["broken.pdf"], Fmt::Txt, None, "could not be opened|damaged"),
        tool_error("errors.mute-without-audio", G, &["video-noaudio.mp4"], ToolId::VideoMute, json!({}), "no audio to remove"),
        tool_error("errors.compress-target-too-small", G, &["video.mp4"], ToolId::VideoCompress, json!({ "targetSizeMb": 0.001 }), "too small"),
        heic,
        convert_error("errors.scanned-pdf-ocr-off", G, &["scan.pdf"], Fmt::Txt, Some(json!({ "ocr": "off" })), "no text layer"),
        tool_error("errors.trim-too-short", G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 1.01 }), "too short"),
        tool_error("errors.split-single-cut", G, &["video.mp4"], ToolId::VideoSplit, json!({ "mode": "at", "times": [] }), "at least one cut"),
        tool_error("errors.wrong-kind-for-tool", G, &["doc.pdf"], ToolId::VideoTrim, json!({}), "damaged|not really the format|no video track"),
    ]
}
