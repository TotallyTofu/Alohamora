//! Port of src/main/selftest/assert.ts. Every helper returns Err(message) instead of throwing.

use std::path::Path;

use crate::ffmpeg::probe;

pub type Check = std::result::Result<(), String>;

pub fn check(cond: bool, msg: impl Into<String>) -> Check {
    if cond { Ok(()) } else { Err(msg.into()) }
}

pub fn expect_count(outputs: &[String], n: usize) -> Check {
    check(outputs.len() == n, format!("expected {n} output(s), got {}", outputs.len()))
}

pub fn expect_non_empty(file: &str) -> Check {
    let size = std::fs::metadata(file).map(|m| m.len()).unwrap_or(0);
    check(size > 0, format!("{file} is missing or empty"))
}

/// Expected codec for a stream: anything, no such stream, or this codec name.
#[derive(Clone, Copy)]
pub enum Codec {
    Any,
    None,
    Is(&'static str),
}

pub fn expect_streams(file: &str, video: Codec, audio: Codec, duration: Option<(f64, f64)>) -> Check {
    expect_non_empty(file)?;
    let p = probe(Path::new(file)).map_err(|e| e.to_string())?;
    let v = p.video.as_ref().map(|v| v.codec.as_str());
    let a = p.audio.as_ref().map(|a| a.codec.as_str());
    match video {
        Codec::Any => {}
        Codec::None => check(v.is_none(), format!("video codec: expected none, got {}", v.unwrap_or("none")))?,
        Codec::Is(c) => check(v == Some(c), format!("video codec: expected {c}, got {}", v.unwrap_or("none")))?,
    }
    match audio {
        Codec::Any => {}
        Codec::None => check(a.is_none(), format!("audio codec: expected none, got {}", a.unwrap_or("none")))?,
        Codec::Is(c) => check(a == Some(c), format!("audio codec: expected {c}, got {}", a.unwrap_or("none")))?,
    }
    if let Some((sec, tol)) = duration {
        check((p.duration_sec - sec).abs() <= tol, format!("duration: expected ~{sec}s, got {}s", p.duration_sec))?;
    }
    Ok(())
}

pub fn expect_magic(file: &str, offset: usize, ascii: &str) -> Check {
    let bytes = std::fs::read(file).map_err(|e| e.to_string())?;
    let got = bytes.get(offset..offset + ascii.len()).map(|b| String::from_utf8_lossy(b).to_string()).unwrap_or_default();
    check(got == ascii, format!("{file}: expected \"{ascii}\" at byte {offset}, got \"{got}\""))
}

pub fn expect_text_includes(file: &str, text: &str) -> Check {
    let t = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    check(t.contains(text), format!("{file} does not contain \"{text}\""))
}

/// Text output with the BOM removed and CRLF normalised.
pub fn read_text(file: &str) -> String {
    std::fs::read_to_string(file).unwrap_or_default().trim_start_matches('\u{FEFF}').replace("\r\n", "\n")
}
