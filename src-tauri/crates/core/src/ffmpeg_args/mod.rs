//! Port of src/main/engines/ffmpegArgs.ts: pure FFmpeg argument builders for conversions.
//! Arguments never include `-y`, `-progress` or the global flags; the runner adds those.

pub mod audio;
pub mod video;

use crate::ffmpeg_parse::ProbeResult;
use crate::js::js_num;
use crate::types::Fmt;

/// Build an argument vector from string slices.
pub fn args(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| s.to_string()).collect()
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct MediaFacts {
    pub duration_sec: f64,
    pub container: String,
    pub has_video: bool,
    pub has_audio: bool,
    pub has_cover: bool,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    /// Display size (after rotation).
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Quality {
    pub crf: f64,
    pub audio_kbps: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GifOptions {
    pub width: f64,
    pub fps: f64,
}

impl Default for GifOptions {
    fn default() -> Self {
        GifOptions { width: 480.0, fps: 12.0 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioMode {
    Encode,
    Copy,
    None,
}

pub fn to_facts(p: &ProbeResult) -> MediaFacts {
    MediaFacts {
        duration_sec: p.duration_sec,
        container: p.format_name.clone(),
        has_video: p.video.is_some(),
        has_audio: p.audio.is_some(),
        has_cover: p.has_cover,
        video_codec: p.video.as_ref().map(|v| v.codec.clone()),
        audio_codec: p.audio.as_ref().map(|a| a.codec.clone()),
        width: p.video.as_ref().map(|v| v.display_width),
        height: p.video.as_ref().map(|v| v.display_height),
        fps: p.video.as_ref().map(|v| v.fps),
        sample_rate: p.audio.as_ref().map(|a| a.sample_rate),
        channels: p.audio.as_ref().map(|a| a.channels),
    }
}

/// Codecs each container can hold as-is (names as ffprobe reports them).
fn copy_rule(target: Fmt) -> Option<(&'static [&'static str], &'static [&'static str])> {
    match target {
        Fmt::Mp4 => Some((&["h264", "hevc", "av1", "mpeg4"], &["aac", "mp3", "alac", "opus", "ac3"])),
        Fmt::Mov => Some((&["h264", "hevc", "mpeg4", "prores", "mjpeg"], &["aac", "mp3", "alac", "pcm_s16le", "pcm_s24le"])),
        Fmt::Mkv => Some((
            &["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "mpeg2video", "theora"],
            &["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts", "alac", "pcm_s16le"],
        )),
        Fmt::Webm => Some((&["vp8", "vp9", "av1"], &["opus", "vorbis"])),
        Fmt::Avi => Some((&["mpeg4", "mjpeg", "msmpeg4v3"], &["mp3", "ac3", "pcm_s16le"])),
        Fmt::Wmv => Some((&["wmv1", "wmv2", "wmv3", "vc1"], &["wmav1", "wmav2", "wmapro"])),
        _ => None,
    }
}

/// True when streams can be copied into `target` without re-encoding (instant & lossless).
pub fn can_remux(f: &MediaFacts, target: Fmt) -> bool {
    let Some((video_ok, audio_ok)) = copy_rule(target) else { return false };
    if !f.has_video {
        return false;
    }
    match &f.video_codec {
        Some(c) if video_ok.contains(&c.as_str()) => {}
        _ => return false,
    }
    if f.has_audio {
        match &f.audio_codec {
            Some(c) if audio_ok.contains(&c.as_str()) => {}
            _ => return false,
        }
    }
    true
}

pub const EVEN_SCALE: &str = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

/// The -vf value: extra filters + even-size guard, or the GIF palette chain.
pub fn video_filter(target: Fmt, filters: &[String], gif: GifOptions) -> String {
    let mut parts: Vec<String> = filters.to_vec();
    if target == Fmt::Gif {
        let scale = if gif.width > 0.0 {
            format!("scale='min({},iw)':-1:flags=lanczos", js_num(gif.width))
        } else {
            "scale=iw:ih".to_string()
        };
        parts.push(format!("fps={}", js_num(gif.fps)));
        parts.push(scale);
        parts.push("split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle".to_string());
    } else {
        parts.push(EVEN_SCALE.to_string());
    }
    parts.join(",")
}

pub fn wmv_bitrate(f: &MediaFacts) -> &'static str {
    let px = f.width.unwrap_or(1280) as u64 * f.height.unwrap_or(720) as u64;
    if px <= 640 * 480 {
        "1500k"
    } else if px <= 1280 * 720 {
        "3000k"
    } else if px <= 1920 * 1080 {
        "6000k"
    } else {
        "12000k"
    }
}

fn video_audio_codec(target: Fmt, q: Quality) -> Vec<String> {
    match target {
        Fmt::Webm => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), format!("{}k", js_num(q.audio_kbps.min(160.0)))],
        Fmt::Avi => args(&["-c:a", "libmp3lame", "-q:a", "3"]),
        Fmt::Wmv => args(&["-c:a", "wmav2", "-b:a", "192k"]),
        _ => vec!["-c:a".into(), "aac".into(), "-b:a".into(), format!("{}k", js_num(q.audio_kbps))],
    }
}

/// Codec flags for a verified hardware H.264 encoder; quality roughly matches the CRF.
pub fn hw_h264_args(encoder: &str, crf: f64) -> Vec<String> {
    let c = js_num(crf);
    match encoder {
        "h264_videotoolbox" => {
            let q = (100.0 - crf * 1.6).clamp(30.0, 80.0);
            vec!["-c:v".into(), "h264_videotoolbox".into(), "-q:v".into(), js_num(q), "-allow_sw".into(), "1".into(), "-pix_fmt".into(), "yuv420p".into()]
        }
        "h264_nvenc" => vec!["-c:v".into(), "h264_nvenc".into(), "-preset".into(), "p5".into(), "-rc".into(), "vbr".into(), "-cq".into(), c, "-b:v".into(), "0".into(), "-pix_fmt".into(), "yuv420p".into()],
        "h264_qsv" => vec!["-c:v".into(), "h264_qsv".into(), "-global_quality".into(), c, "-pix_fmt".into(), "nv12".into()],
        "h264_amf" => vec!["-c:v".into(), "h264_amf".into(), "-rc".into(), "cqp".into(), "-qp_i".into(), c.clone(), "-qp_p".into(), c, "-pix_fmt".into(), "yuv420p".into()],
        _ => vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(), c, "-pix_fmt".into(), "yuv420p".into()],
    }
}

/// Codec flags to encode INTO `target`. No -i, -vf, -map or output path. `hw` = a verified hardware H.264 encoder.
pub fn video_encode_args(target: Fmt, q: Quality, f: &MediaFacts, audio: AudioMode, hw: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    match target {
        Fmt::Mp4 | Fmt::Mov | Fmt::Mkv => match hw {
            Some(enc) => a.extend(hw_h264_args(enc, q.crf)),
            None => a.extend(vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(), js_num(q.crf), "-pix_fmt".into(), "yuv420p".into()]),
        },
        Fmt::Webm => a.extend(vec![
            "-c:v".into(), "libvpx-vp9".into(), "-crf".into(), js_num((q.crf + 9.0).min(63.0)), "-b:v".into(), "0".into(),
            "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into(),
        ]),
        Fmt::Avi => a.extend(args(&["-c:v", "mpeg4", "-q:v", "4", "-vtag", "xvid"])),
        Fmt::Wmv => a.extend(vec!["-c:v".into(), "wmv2".into(), "-b:v".into(), wmv_bitrate(f).into()]),
        Fmt::Gif => {}
        other => panic!("No video encoder for {}", other.as_str()),
    }
    if target == Fmt::Gif || audio == AudioMode::None || !f.has_audio {
        a.push("-an".into());
    } else if audio == AudioMode::Copy {
        a.extend(args(&["-c:a", "copy"]));
    } else {
        a.extend(video_audio_codec(target, q));
    }
    if target == Fmt::Mp4 || target == Fmt::Mov {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    a
}

/// Codec flags for an audio-only output. Errors for a non-audio target.
pub fn audio_codec_args(target: Fmt, q: Quality, f: &MediaFacts) -> Result<Vec<String>, String> {
    let k = |v: f64| format!("{}k", js_num(v));
    let mut a: Vec<String> = match target {
        Fmt::Mp3 => args(&["-c:a", "libmp3lame", "-q:a", "2"]),
        Fmt::M4a => vec!["-c:a".into(), "aac".into(), "-b:a".into(), k(q.audio_kbps)],
        Fmt::Wav => args(&["-c:a", "pcm_s16le"]),
        Fmt::Flac => args(&["-c:a", "flac", "-compression_level", "5"]),
        Fmt::Ogg => args(&["-c:a", "libvorbis", "-q:a", "5"]),
        Fmt::Opus => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), k(q.audio_kbps.min(160.0)), "-ar".into(), "48000".into()],
        Fmt::Aiff => args(&["-c:a", "pcm_s16be"]),
        Fmt::Wma => vec!["-c:a".into(), "wmav2".into(), "-b:a".into(), k(q.audio_kbps.min(192.0))],
        other => return Err(format!("No audio encoder for {}", other.as_str())),
    };
    let sr = f.sample_rate.unwrap_or(0);
    if matches!(target, Fmt::Mp3 | Fmt::Wma | Fmt::M4a) && sr > 48000 {
        a.extend(args(&["-ar", "48000"]));
    }
    if matches!(target, Fmt::Mp3 | Fmt::Wma) && f.channels.unwrap_or(2) > 2 {
        a.extend(args(&["-ac", "2"]));
    }
    if target == Fmt::Mp3 {
        a.extend(args(&["-id3v2_version", "3"]));
    }
    if target == Fmt::M4a {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    Ok(a)
}

pub fn audio_convert_args(input: &str, output: &str, f: &MediaFacts, target: Fmt, q: Quality, keep_cover: bool) -> Result<Vec<String>, String> {
    let cover = keep_cover && f.has_cover && matches!(target, Fmt::Mp3 | Fmt::M4a | Fmt::Flac);
    let mut a = args(&["-i", input, "-map", "0:a:0"]);
    if cover {
        a.extend(args(&["-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    } else {
        a.push("-vn".into());
    }
    a.extend(args(&["-map_metadata", "0"]));
    a.extend(audio_codec_args(target, q, f)?);
    a.push(output.into());
    Ok(a)
}

pub fn video_convert_args(input: &str, output: &str, f: &MediaFacts, target: Fmt, q: Quality, gif: GifOptions, hw: Option<&str>) -> Result<Vec<String>, String> {
    if target == Fmt::Mp3 {
        return audio_convert_args(input, output, f, Fmt::Mp3, q, false);
    }
    if can_remux(f, target) {
        let mut a = args(&["-i", input, "-map", "0:v:0", "-map", "0:a?", "-c", "copy"]);
        if target == Fmt::Mp4 || target == Fmt::Mov {
            a.extend(args(&["-movflags", "+faststart"]));
            if f.video_codec.as_deref() == Some("hevc") {
                a.extend(args(&["-tag:v", "hvc1"]));
            }
        }
        a.push(output.into());
        return Ok(a);
    }
    let mut a = args(&["-i", input, "-map", "0:v:0"]);
    if target != Fmt::Gif {
        a.extend(args(&["-map", "0:a:0?"]));
    }
    a.push("-vf".into());
    a.push(video_filter(target, &[], gif));
    a.extend(video_encode_args(target, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    Ok(a)
}

#[cfg(test)]
pub(crate) fn test_facts() -> MediaFacts {
    MediaFacts {
        duration_sec: 4.0,
        container: "matroska,webm".into(),
        has_video: true,
        has_audio: true,
        has_cover: false,
        video_codec: Some("h264".into()),
        audio_codec: Some("aac".into()),
        width: Some(640),
        height: Some(360),
        fps: Some(30.0),
        sample_rate: Some(48000),
        channels: Some(2),
    }
}

/// Value following `flag` (first occurrence).
#[cfg(test)]
pub(crate) fn after<'a>(a: &'a [String], flag: &str) -> Option<&'a str> {
    let i = a.iter().position(|x| x == flag)?;
    a.get(i + 1).map(|s| s.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    const Q: Quality = Quality { crf: 23.0, audio_kbps: 192.0 };
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn remux_and_encode() {
        let f = test_facts();
        let a = video_convert_args("in.mkv", "out.mp4", &f, Fmt::Mp4, Q, GifOptions::default(), None).unwrap();
        assert_eq!(after(&a, "-c"), Some("copy"));
        assert!(has(&a, "+faststart") && !has(&a, "libx264"));
        let hevc = MediaFacts { video_codec: Some("hevc".into()), ..f.clone() };
        assert_eq!(after(&video_convert_args("i", "o", &hevc, Fmt::Mp4, Q, GifOptions::default(), None).unwrap(), "-tag:v"), Some("hvc1"));
        let vp9 = MediaFacts { video_codec: Some("vp9".into()), audio_codec: Some("opus".into()), ..f.clone() };
        let e = video_convert_args("in.webm", "out.mp4", &vp9, Fmt::Mp4, Q, GifOptions::default(), None).unwrap();
        assert!(has(&e, "libx264") && after(&e, "-vf").unwrap().ends_with(EVEN_SCALE));
        let w = video_convert_args("in.mp4", "out.webm", &f, Fmt::Webm, Q, GifOptions::default(), None).unwrap();
        assert!(has(&w, "libvpx-vp9") && has(&w, "libopus"));
        let g = video_convert_args("in.mp4", "out.gif", &f, Fmt::Gif, Q, GifOptions { width: 320.0, fps: 10.0 }, None).unwrap();
        assert!(after(&g, "-vf").unwrap().contains("palettegen") && has(&g, "-an") && !has(&g, "0:a:0?"));
        let m = video_convert_args("in.mp4", "out.mp3", &f, Fmt::Mp3, Q, GifOptions::default(), None).unwrap();
        assert!(has(&m, "libmp3lame") && has(&m, "-vn"));
        let silent = MediaFacts { has_audio: false, video_codec: Some("vp9".into()), ..f.clone() };
        assert!(has(&video_convert_args("i", "o", &silent, Fmt::Mp4, Q, GifOptions::default(), None).unwrap(), "-an"));
        let qsv = video_convert_args("in.webm", "out.mp4", &vp9, Fmt::Mp4, Q, GifOptions::default(), Some("h264_qsv")).unwrap();
        assert!(has(&qsv, "h264_qsv"));
    }

    #[test]
    fn audio_conversions() {
        let wav96 = MediaFacts { has_video: false, sample_rate: Some(96000), audio_codec: Some("pcm_s24le".into()), ..test_facts() };
        assert_eq!(after(&audio_convert_args("in.wav", "out.mp3", &wav96, Fmt::Mp3, Q, false).unwrap(), "-ar"), Some("48000"));
        let wav44 = MediaFacts { has_video: false, sample_rate: Some(44100), ..test_facts() };
        assert_eq!(after(&audio_convert_args("in.wav", "out.opus", &wav44, Fmt::Opus, Q, false).unwrap(), "-ar"), Some("48000"));
        let cover = MediaFacts { has_video: false, has_cover: true, ..test_facts() };
        assert!(has(&audio_convert_args("i", "o", &cover, Fmt::M4a, Q, true).unwrap(), "attached_pic"));
        assert!(has(&audio_convert_args("i", "o", &cover, Fmt::Wav, Q, true).unwrap(), "-vn"));
        let six = MediaFacts { channels: Some(6), has_video: false, ..test_facts() };
        assert_eq!(after(&audio_convert_args("i", "o", &six, Fmt::Mp3, Q, false).unwrap(), "-ac"), Some("2"));
        assert!(audio_convert_args("a", "b", &test_facts(), Fmt::Png, Q, false).is_err());
    }

    #[test]
    fn remux_rules_and_helpers() {
        let f = test_facts();
        assert!(!can_remux(&MediaFacts { has_video: false, ..f.clone() }, Fmt::Mp4));
        assert!(!can_remux(&MediaFacts { audio_codec: Some("vorbis".into()), ..f.clone() }, Fmt::Mp4));
        assert!(can_remux(&MediaFacts { has_audio: false, audio_codec: None, ..f.clone() }, Fmt::Mp4));
        assert!(!can_remux(&f, Fmt::Gif));
        assert_eq!(video_filter(Fmt::Mp4, &["crop=100:100:0:0".into()], GifOptions::default()), format!("crop=100:100:0:0,{EVEN_SCALE}"));
        assert_eq!(wmv_bitrate(&f), "1500k");
        assert_eq!(wmv_bitrate(&MediaFacts { width: Some(3840), height: Some(2160), ..f.clone() }), "12000k");
    }

    #[test]
    fn hardware() {
        assert!(has(&hw_h264_args("h264_videotoolbox", 23.0), "-q:v"));
        assert_eq!(hw_h264_args("h264_videotoolbox", 23.0)[3], "63.199999999999996"); // JavaScript prints the same
        let nv = hw_h264_args("h264_nvenc", 23.0);
        assert_eq!(after(&nv, "-cq"), Some("23"));
        assert_eq!(after(&hw_h264_args("h264_qsv", 23.0), "-global_quality"), Some("23"));
        assert!(has(&hw_h264_args("h264_amf", 23.0), "cqp"));
        assert!(has(&hw_h264_args("something-else", 23.0), "libx264"));
        let f = test_facts();
        let a = video_encode_args(Fmt::Mp4, Q, &f, AudioMode::Encode, Some("h264_nvenc"));
        assert!(has(&a, "h264_nvenc") && !has(&a, "libx264"));
        assert!(!has(&video_encode_args(Fmt::Webm, Q, &f, AudioMode::Encode, Some("h264_nvenc")), "h264_nvenc"));
        assert!(has(&video_encode_args(Fmt::Mp4, Q, &f, AudioMode::Encode, None), "libx264"));
    }
}
