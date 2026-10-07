//! Port of src/main/engines/ffmpegParse.ts (pure parsing of FFmpeg/FFprobe output).

use std::collections::HashMap;

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct ProbeVideo {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub display_width: u32,
    pub display_height: u32,
    pub fps: f64,
    pub pix_fmt: String,
    pub rotation: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProbeAudio {
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub bit_rate: u64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ProbeResult {
    pub duration_sec: f64,
    pub format_name: String,
    pub bit_rate: u64,
    pub video: Option<ProbeVideo>,
    pub audio: Option<ProbeAudio>,
    pub has_cover: bool,
    /// Format-level tags with lower-case keys.
    pub tags: HashMap<String, String>,
}

/// Encoder names from `ffmpeg -hide_banner -encoders` (the second column after the "------" line).
pub fn parse_encoder_list(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.iter().position(|l| l.trim().starts_with("------")).map(|i| i + 1).unwrap_or(0);
    lines[start..]
        .iter()
        .filter_map(|l| {
            let parts: Vec<&str> = l.split_whitespace().collect();
            if parts.len() >= 2 { Some(parts[1].to_string()) } else { None }
        })
        .collect()
}

/// "30000/1001" → 29.97; "25/1" → 25; bad input → 0.
pub fn parse_rate(r: Option<&str>) -> f64 {
    let Some(r) = r else { return 0.0 };
    let mut it = r.split('/');
    let a: f64 = it.next().and_then(|s| s.trim().parse().ok()).unwrap_or(f64::NAN);
    match it.next() {
        None => if a.is_finite() { a } else { 0.0 },
        Some(b) => {
            let b: f64 = b.trim().parse().unwrap_or(0.0);
            if b == 0.0 || !a.is_finite() { 0.0 } else { a / b }
        }
    }
}

fn num(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => s.trim().parse().unwrap_or(f64::NAN),
        _ => f64::NAN,
    }
}

fn str_of(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

pub fn parse_probe_json(json: &str) -> Result<ProbeResult, serde_json::Error> {
    let data: Value = serde_json::from_str(json)?;
    let empty = Vec::new();
    let streams = data["streams"].as_array().unwrap_or(&empty);
    let is_cover = |s: &Value| s["disposition"]["attached_pic"].as_i64() == Some(1);
    let v = streams.iter().find(|s| s["codec_type"] == "video" && !is_cover(s));
    let has_cover = streams.iter().any(|s| s["codec_type"] == "video" && is_cover(s));
    let a = streams.iter().find(|s| s["codec_type"] == "audio");

    let mut video = None;
    if let Some(v) = v {
        let (w, h) = (v["width"].as_u64().unwrap_or(0) as u32, v["height"].as_u64().unwrap_or(0) as u32);
        if w > 0 && h > 0 {
            let side_rot = v["side_data_list"]
                .as_array()
                .and_then(|l| l.iter().find(|d| !d["rotation"].is_null()))
                .map(|d| num(&d["rotation"]));
            let rot = side_rot.unwrap_or_else(|| num(&v["tags"]["rotate"]));
            let rot = if rot.is_finite() { rot } else { 0.0 };
            let swap = (rot.abs() % 180.0) == 90.0;
            let mut fps = parse_rate(v["avg_frame_rate"].as_str());
            if fps == 0.0 {
                fps = parse_rate(v["r_frame_rate"].as_str());
            }
            video = Some(ProbeVideo {
                codec: str_of(&v["codec_name"]),
                width: w,
                height: h,
                display_width: if swap { h } else { w },
                display_height: if swap { w } else { h },
                fps: if fps > 0.0 && fps < 1000.0 { fps } else { 0.0 },
                pix_fmt: str_of(&v["pix_fmt"]),
                rotation: rot,
            });
        }
    }
    let audio = a.map(|a| ProbeAudio {
        codec: str_of(&a["codec_name"]),
        sample_rate: num(&a["sample_rate"]).max(0.0) as u32,
        channels: a["channels"].as_u64().unwrap_or(0) as u32,
        bit_rate: { let b = num(&a["bit_rate"]); if b.is_finite() && b > 0.0 { b as u64 } else { 0 } },
    });
    let f = &data["format"];
    let mut durations = vec![num(&f["duration"])];
    durations.extend(streams.iter().map(|s| num(&s["duration"])));
    let duration_sec = durations.into_iter().find(|d| d.is_finite() && *d > 0.0).unwrap_or(0.0);
    let mut tags = HashMap::new();
    if let Some(obj) = f["tags"].as_object() {
        for (k, val) in obj {
            let text = match val {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            tags.insert(k.to_lowercase(), text);
        }
    }
    let br = num(&f["bit_rate"]);
    Ok(ProbeResult {
        duration_sec,
        format_name: str_of(&f["format_name"]),
        bit_rate: if br.is_finite() && br > 0.0 { br as u64 } else { 0 },
        video,
        audio,
        has_cover,
        tags,
    })
}

/// Map FFmpeg stderr to a plain-English message (PLAN.md Appendix C).
pub fn friendly_ffmpeg_error(stderr: &str) -> String {
    let s = stderr.to_lowercase();
    let msg = if s.contains("invalid data found when processing input") || s.contains("moov atom not found") {
        "This file looks damaged, or it is not really the format its name says."
    } else if s.contains("matches no streams") || s.contains("does not contain any stream") {
        "This file has no usable audio or video for this action."
    } else if s.contains("permission denied") {
        crate::error::MSG_CANT_ACCESS
    } else if s.contains("no space left") {
        crate::error::MSG_DISK_FULL
    } else if s.contains("unknown encoder") || s.contains("encoder not found") {
        "This FFmpeg build is missing an encoder needed for this format."
    } else if s.contains("not divisible by 2") {
        "The encoder needs an even width and height."
    } else {
        "FFmpeg could not process this file."
    };
    msg.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn encoders() {
        let text = "Encoders:\n V..... = Video\n ------\n V....D libx264              libx264 H.264\n A....D aac                  AAC\n";
        assert_eq!(parse_encoder_list(text), vec!["libx264", "aac"]);
        assert_eq!(parse_encoder_list("Encoders:\r\n ------\r\n A....D flac FLAC\r\n"), vec!["flac"]);
    }

    #[test]
    fn rates() {
        assert!((parse_rate(Some("30000/1001")) - 29.97).abs() < 0.01);
        assert_eq!(parse_rate(Some("25/1")), 25.0);
        assert_eq!(parse_rate(Some("0/0")), 0.0);
        assert_eq!(parse_rate(None), 0.0);
        assert_eq!(parse_rate(Some("abc")), 0.0);
    }

    #[test]
    fn probe() {
        let j = json!({
            "streams": [
                { "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "avg_frame_rate": "30/1", "side_data_list": [{ "rotation": -90 }] },
                { "codec_type": "audio", "codec_name": "aac", "sample_rate": "48000", "channels": 2, "bit_rate": "128000" }
            ],
            "format": { "duration": "12.5", "format_name": "mov,mp4", "bit_rate": "2000000", "tags": { "Title": "Clip" } }
        });
        let p = parse_probe_json(&j.to_string()).unwrap();
        let v = p.video.unwrap();
        assert_eq!((v.display_width, v.display_height, v.rotation, v.fps), (1080, 1920, -90.0, 30.0));
        assert_eq!(p.audio.unwrap(), ProbeAudio { codec: "aac".into(), sample_rate: 48000, channels: 2, bit_rate: 128000 });
        assert_eq!(p.duration_sec, 12.5);
        assert_eq!(p.tags["title"], "Clip");

        let cover = json!({ "streams": [
            { "codec_type": "audio", "codec_name": "mp3", "sample_rate": "44100", "channels": 2 },
            { "codec_type": "video", "codec_name": "mjpeg", "width": 600, "height": 600, "disposition": { "attached_pic": 1 } }
        ], "format": { "duration": "200", "format_name": "mp3" } });
        let c = parse_probe_json(&cover.to_string()).unwrap();
        assert!(c.has_cover && c.video.is_none());

        let partial = parse_probe_json(&json!({ "streams": [{ "codec_type": "audio", "duration": "3.2" }] }).to_string()).unwrap();
        assert_eq!(partial.duration_sec, 3.2);
    }

    #[test]
    fn friendly() {
        assert!(friendly_ffmpeg_error("moov atom not found").contains("damaged"));
        assert!(friendly_ffmpeg_error("Permission denied").contains("can't read or write"));
        assert_eq!(friendly_ffmpeg_error("No space left on device"), "The disk is full.");
        assert_eq!(friendly_ffmpeg_error("something odd"), "FFmpeg could not process this file.");
    }
}
