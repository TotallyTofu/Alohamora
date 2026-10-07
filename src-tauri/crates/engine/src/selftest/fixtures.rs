//! Port of src/main/selftest/fixtures.ts: test inputs, generated once and cached in <root>/fixtures.

use std::path::Path;

use crate::ffmpeg::{run_ffmpeg, FfmpegRun};
use crate::paths::p2s;
use crate::{AppError, Result};

fn ff(args: &[&str]) -> Result<()> {
    let a: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    run_ffmpeg(&a, FfmpegRun::default())
}

/// Create the fixture once and return its path.
pub fn ensure(dir: &Path, name: &str) -> Result<String> {
    let out = dir.join(name);
    if out.exists() {
        return Ok(p2s(&out));
    }
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("tmp-{name}")); // keeps the extension for FFmpeg
    make(dir, name, &p2s(&tmp))?;
    std::fs::rename(&tmp, &out)?;
    Ok(p2s(&out))
}

fn make(dir: &Path, name: &str, out: &str) -> Result<()> {
    match name {
        "video.mp4" => ff(&["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
            "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", out]),
        "titled.mp4" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", "-metadata", "title=Hello", out]),
        "video-copy.mp4" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", out]),
        "video-vp9.webm" => ff(&["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000",
            "-t", "3", "-c:v", "libvpx-vp9", "-b:v", "300k", "-c:a", "libopus", out]),
        "fake.mp4" => Ok(std::fs::write(out, "This is only text, not a video.\n".repeat(40))?),
        "fake.mp3" => Ok(std::fs::write(out, "This is only text, not audio.\n".repeat(40))?),
        "broken.png" => Ok(std::fs::write(out, "not a png at all")?),
        "broken.pdf" => Ok(std::fs::write(out, "%PDF-1.4\nthis file is cut off")?),
        "video-noaudio.mp4" => ff(&["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]),
        "video.mkv" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", out]),
        "anim.gif" => ff(&["-i", &ensure(dir, "video.mp4")?, "-t", "2", "-vf", "fps=10,scale=160:-1", out]),
        "audio.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=4", "-ac", "2", "-c:a", "pcm_s16le", out]),
        "audio-mono.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=3", "-ac", "1", "-c:a", "pcm_s16le", out]),
        "audio-silent.wav" => ff(&["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "2", "-c:a", "pcm_s16le", out]),
        "audio.mp3" => ff(&["-i", &ensure(dir, "audio.wav")?, "-c:a", "libmp3lame", "-q:a", "4", out]),
        "stereo-lr.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-f", "lavfi", "-i", "sine=frequency=880:duration=4",
            "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]", "-map", "[a]", "-c:a", "pcm_s16le", out]),
        "text.txt" => Ok(std::fs::write(out, [
            "Alohamora test document",
            "Xin chào thế giới — Tiếng Việt có dấu.",
            "The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.",
            "",
            "Last line.",
        ].join("\n"))?),
        "subs.srt" => Ok(std::fs::write(out, "\u{FEFF}1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nThird\r\n")?),
        "subs.vtt" => Ok(std::fs::write(out, "WEBVTT\n\nNOTE test file\n\n00:01.000 --> 00:02.500 align:start\nHello <v Bob>world</v>\n\nid2\n00:00:03.000 --> 00:00:04.000\nSecond line\n")?),
        other => crate::selftest::fixtures_docs::make(dir, other, out).unwrap_or_else(|| Err(AppError::other(format!("No fixture maker for {other}")))),
    }
}
