//! Port of src/main/selftest/cases/tools-audio.ts.

use std::path::Path;

use alohamora_core::types::ToolId;
use serde_json::json;

use super::{tool_case, tool_error, Case};
use crate::ffmpeg::probe;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};
use crate::selftest::fixtures_docs::expect_image;

const G: &str = "tools.audio";

fn n(name: &str) -> String {
    format!("tools.audio.{name}")
}

fn channels(file: &str) -> u32 {
    probe(Path::new(file)).ok().and_then(|p| p.audio).map(|a| a.channels).unwrap_or(0)
}

pub fn cases() -> Vec<Case> {
    vec![
        tool_case(&n("compress"), G, &["audio.wav"], ToolId::AudioCompress, json!({ "bitrateKbps": 128, "format": "keep" }), |o| {
            expect_count(o, 1)?;
            check(o[0].ends_with(".mp3"), format!("WAV should compress to MP3, got {}", o[0]))?;
            expect_streams(&o[0], Codec::Any, Codec::Is("mp3"), Some((4.0, 0.5)))
        }),
        tool_case(&n("channels-mono"), G, &["audio.wav"], ToolId::AudioChannels, json!({ "mode": "mono" }), |o| {
            expect_count(o, 1)?;
            check(channels(&o[0]) == 1, "expected 1 channel")
        }),
        tool_case(&n("channels-swap"), G, &["stereo-lr.wav"], ToolId::AudioChannels, json!({ "mode": "swap" }), |o| {
            expect_count(o, 1)?;
            check(channels(&o[0]) == 2, "expected 2 channels")
        }),
        tool_error(&n("channels-left-on-mono-fails"), G, &["audio-mono.wav"], ToolId::AudioChannels, json!({ "mode": "left" }), "mono"),
        tool_case(&n("normalize"), G, &["audio.wav"], ToolId::AudioNormalize, json!({ "target": -16, "truePeak": -1.5 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.3)))
        }),
        tool_error(&n("normalize-silent-fails"), G, &["audio-silent.wav"], ToolId::AudioNormalize, json!({}), "silent"),
        tool_case(&n("trim-fade"), G, &["audio.wav"], ToolId::AudioTrim, json!({ "startSec": 1, "endSec": 3, "fadeInSec": 0.5 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((2.0, 0.1)))
        }),
        tool_case(&n("visualize-png"), G, &["audio.wav"], ToolId::AudioVisualize, json!({ "kind": "waveform-png", "width": 1920, "height": 480 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((1920, 480)))
        }),
        tool_case(&n("visualize-mp4"), G, &["audio.wav"], ToolId::AudioVisualize, json!({ "kind": "waveform-mp4", "width": 640, "height": 360 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), None)
        }),
        tool_case(&n("bleep"), G, &["audio.wav"], ToolId::AudioBleep, json!({ "ranges": [{ "startSec": 1, "endSec": 2 }], "sound": "beep", "frequency": 1000 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.2)))
        }),
        tool_case(&n("metadata-title"), G, &["audio.mp3"], ToolId::AudioMetadata, json!({ "tags": { "title": "Song" } }), |o| {
            expect_count(o, 1)?;
            let t = probe(Path::new(&o[0])).map_err(|e| e.to_string())?.tags.get("title").cloned();
            check(t.as_deref() == Some("Song"), "title tag should be Song")
        }),
        tool_case(&n("join"), G, &["audio.wav", "audio.mp3"], ToolId::AudioJoin, json!({}), |o| {
            expect_count(o, 1)?;
            let d = probe(Path::new(&o[0])).map_err(|e| e.to_string())?.duration_sec;
            check((d - 8.0).abs() <= 0.3, format!("expected ~8 s, got {d}"))
        }),
    ]
}
