//! Port of src/main/selftest/cases/av.ts.

use alohamora_core::registry::convert_targets;
use alohamora_core::types::{Category, Fmt};

use super::{convert_case, convert_error, Case};
use crate::paths;
use crate::process::run_process;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};

/// The encoder that wrote the first video stream (e.g. "Lavc60 libx264" or "Lavc60 h264_nvenc").
fn video_encoder_tag(file: &str) -> String {
    let args: Vec<String> = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=encoder", "-of", "default=nw=1:nk=1", file]
        .iter().map(|s| s.to_string()).collect();
    run_process(&paths::ffprobe(), &args, None, "FFprobe").map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
}

fn audio_codec(t: Fmt) -> &'static str {
    match t {
        Fmt::Mp3 => "mp3", Fmt::M4a => "aac", Fmt::Wav => "pcm_s16le", Fmt::Flac => "flac", Fmt::Ogg => "vorbis",
        Fmt::Opus => "opus", Fmt::Aiff => "pcm_s16be", _ => "wmav2",
    }
}

fn video_codec(t: Fmt) -> &'static str {
    match t {
        Fmt::Mp4 | Fmt::Mov | Fmt::Mkv => "h264", Fmt::Webm => "vp9", Fmt::Avi => "mpeg4", Fmt::Wmv => "wmv2", _ => "gif",
    }
}

pub fn cases() -> Vec<Case> {
    let mut v = Vec::new();
    for &t in convert_targets(Category::Audio).iter().filter(|t| **t != Fmt::Wav) {
        v.push(convert_case(&format!("convert.audio.wav-{}", t.as_str()), "av", &["audio.wav"], t, None, move |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is(audio_codec(t)), Some((4.0, 0.5)))
        }));
    }
    v.push(convert_case("convert.audio.mp3-wav", "av", &["audio.mp3"], Fmt::Wav, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.5)))
    }));
    for &t in convert_targets(Category::Video).iter().filter(|t| **t != Fmt::Mp4) {
        v.push(convert_case(&format!("convert.video.mp4-{}", t.as_str()), "av", &["video.mp4"], t, None, move |o| {
            expect_count(o, 1)?;
            if t == Fmt::Mp3 {
                expect_streams(&o[0], Codec::None, Codec::Is("mp3"), Some((4.0, 0.5)))
            } else {
                expect_streams(&o[0], Codec::Is(video_codec(t)), Codec::Any, Some((4.0, 0.6)))
            }
        }));
    }
    v.push(convert_case("convert.video.mkv-mp4-remux", "av", &["video.mkv"], Fmt::Mp4, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), Some((4.0, 0.5)))
    }));
    v.push(convert_case("convert.video.gif-mp4", "av", &["anim.gif"], Fmt::Mp4, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::None, None)
    }));
    // VP9 cannot be remuxed into MOV, so this really encodes — and with a verified hardware encoder it must use it.
    let mut hw = convert_case("convert.video.vp9-mov-hw", "av", &["video-vp9.webm"], Fmt::Mov, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((3.0, 0.6)))?;
        let tag = video_encoder_tag(&o[0]);
        check(!tag.contains("libx264"), format!("expected a hardware encoder, got \"{tag}\""))
    });
    hw.skip = Some(|c| if c.hw_video.is_some() { None } else { Some("no verified hardware video encoder on this machine".into()) });
    v.push(hw);
    // A broken hardware encoder must silently fall back to the CPU (libx264), so the job still succeeds.
    let mut fallback = convert_case("convert.video.vp9-mov-hw-fallback", "av", &["video-vp9.webm"], Fmt::Mov, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((3.0, 0.6)))?;
        let tag = video_encoder_tag(&o[0]);
        check(tag.contains("libx264"), format!("expected the CPU fallback (libx264), got \"{tag}\""))
    });
    fallback.caps_override = Some(|c| c.hw_video = Some("h264_this_encoder_does_not_exist".into()));
    v.push(fallback);
    v.push(convert_error("convert.video.noaudio-mp3-fails", "av", &["video-noaudio.mp4"], Fmt::Mp3, None, "no audio"));
    v
}
