//! Port of src/main/engines/audioArgs.ts: argument builders for the audio tools.

use serde::Deserialize;

use super::{args, audio_codec_args, MediaFacts, Quality};
use crate::js::{js_num, js_to_fixed};
use crate::options::{AudioBleepOptions, AudioCompressFormat, AudioNormalizeOptions, AudioTrimOptions, AudioVisualizeOptions, BleepSound, ChannelMode, VisualizeKind};
use crate::types::Fmt;

fn t3(s: f64) -> String {
    js_to_fixed(s, 3)
}

/// "keep" turns lossless inputs (wav/flac/aiff) into mp3; lossy inputs keep their format.
pub fn compress_out_fmt(input: Fmt, choice: AudioCompressFormat) -> Fmt {
    match choice {
        AudioCompressFormat::Mp3 => Fmt::Mp3,
        AudioCompressFormat::M4a => Fmt::M4a,
        AudioCompressFormat::Opus => Fmt::Opus,
        AudioCompressFormat::Keep => {
            if matches!(input, Fmt::Wav | Fmt::Flac | Fmt::Aiff) { Fmt::Mp3 } else { input }
        }
    }
}

pub fn compress_audio_args(input: &str, output: &str, bitrate_kbps: f64, mono: bool, out_fmt: Fmt) -> Result<Vec<String>, String> {
    let k = format!("{}k", js_num(bitrate_kbps));
    let codec: Vec<String> = match out_fmt {
        Fmt::Mp3 => vec!["-c:a".into(), "libmp3lame".into(), "-b:a".into(), k],
        Fmt::M4a => vec!["-c:a".into(), "aac".into(), "-b:a".into(), k, "-movflags".into(), "+faststart".into()],
        Fmt::Opus => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), k, "-ar".into(), "48000".into()],
        Fmt::Ogg => vec!["-c:a".into(), "libvorbis".into(), "-b:a".into(), k],
        Fmt::Wma => vec!["-c:a".into(), "wmav2".into(), "-b:a".into(), k],
        other => return Err(format!("Cannot compress to {}", other.as_str())),
    };
    let mut a = args(&["-i", input, "-map", "0:a:0", "-vn", "-map_metadata", "0"]);
    a.extend(codec);
    if mono {
        a.extend(args(&["-ac", "1"]));
    }
    a.push(output.into());
    Ok(a)
}

pub fn loudnorm_pass1(input: &str, o: &AudioNormalizeOptions) -> Vec<String> {
    let af = format!("loudnorm=I={}:TP={}:LRA=11:print_format=json", js_num(o.target), js_num(o.true_peak));
    vec!["-i".into(), input.into(), "-map".into(), "0:a:0".into(), "-af".into(), af, "-f".into(), "null".into(), "-".into()]
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct LoudnormStats {
    pub input_i: String,
    pub input_tp: String,
    pub input_lra: String,
    pub input_thresh: String,
    pub target_offset: String,
}

/// The JSON block loudnorm prints at the end of stderr.
pub fn parse_loudnorm(stderr: &str) -> Option<LoudnormStats> {
    let start = stderr.rfind('{')?;
    let end = stderr.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&stderr[start..=end]).ok()
}

#[allow(clippy::too_many_arguments)]
pub fn loudnorm_pass2(input: &str, output: &str, f: &MediaFacts, o: &AudioNormalizeOptions, s: &LoudnormStats, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let af = format!(
        "loudnorm=I={}:TP={}:LRA=11:measured_I={}:measured_TP={}:measured_LRA={}:measured_thresh={}:offset={}:linear=true:print_format=summary",
        js_num(o.target), js_num(o.true_peak), s.input_i, s.input_tp, s.input_lra, s.input_thresh, s.target_offset
    );
    let sr = f.sample_rate.filter(|v| *v > 0).unwrap_or(48000);
    // -ar BEFORE codec args so a codec-required rate (e.g. Opus 48 kHz) wins. loudnorm upsamples to 192 kHz otherwise.
    let mut a = vec!["-i".into(), input.into(), "-map".into(), "0:a:0".into(), "-vn".into(), "-map_metadata".into(), "0".into(), "-af".into(), af, "-ar".into(), sr.to_string()];
    a.extend(audio_codec_args(fmt, q, f)?);
    a.push(output.into());
    Ok(a)
}

pub fn trim_audio_args(input: &str, output: &str, f: &MediaFacts, o: &AudioTrimOptions, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    let d = (end - o.start_sec).max(0.05);
    let mut fades = Vec::new();
    if o.fade_in_sec > 0.0 {
        fades.push(format!("afade=t=in:st=0:d={}", t3(o.fade_in_sec)));
    }
    if o.fade_out_sec > 0.0 {
        fades.push(format!("afade=t=out:st={}:d={}", t3((d - o.fade_out_sec).max(0.0)), t3(o.fade_out_sec)));
    }
    let mut a = vec!["-ss".into(), t3(o.start_sec), "-i".into(), input.into(), "-t".into(), t3(d)];
    a.extend(args(&["-map", "0:a:0", "-vn", "-map_metadata", "0"]));
    if fades.is_empty() {
        a.extend(args(&["-c:a", "copy"]));
    } else {
        a.push("-af".into());
        a.push(fades.join(","));
        a.extend(audio_codec_args(fmt, q, f)?);
    }
    a.push(output.into());
    Ok(a)
}

pub fn channels_args(input: &str, output: &str, f: &MediaFacts, mode: ChannelMode, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let channel: Vec<String> = match mode {
        ChannelMode::Mono => args(&["-ac", "1"]),
        ChannelMode::Stereo => args(&["-ac", "2"]),
        ChannelMode::Left => args(&["-af", "pan=mono|c0=c0"]),
        ChannelMode::Right => args(&["-af", "pan=mono|c0=c1"]),
        ChannelMode::Swap => args(&["-af", "pan=stereo|c0=c1|c1=c0"]),
    };
    // channel args AFTER codec args so they win over the codec's automatic "-ac 2"
    let mut a = args(&["-i", input, "-map", "0:a:0", "-vn", "-map_metadata", "0"]);
    a.extend(audio_codec_args(fmt, q, f)?);
    a.extend(channel);
    a.push(output.into());
    Ok(a)
}

pub fn visualize_args(input: &str, output: &str, o: &AudioVisualizeOptions) -> Vec<String> {
    let w = (crate::js::js_round(o.width / 2.0) * 2.0) as u32;
    let h = (crate::js::js_round(o.height / 2.0) * 2.0) as u32;
    let color = o.color.replacen('#', "0x", 1);
    let bg = o.background.replacen('#', "0x", 1);
    match o.kind {
        VisualizeKind::WaveformPng => vec![
            "-i".into(), input.into(), "-filter_complex".into(),
            format!("[0:a:0]aformat=channel_layouts=mono,showwavespic=s={w}x{h}:colors={color}[fg];color=c={bg}:s={w}x{h}[bg];[bg][fg]overlay=format=auto"),
            "-frames:v".into(), "1".into(), output.into(),
        ],
        VisualizeKind::SpectrogramPng => vec!["-i".into(), input.into(), "-lavfi".into(), format!("showspectrumpic=s={w}x{h}:legend=1"), output.into()],
        VisualizeKind::WaveformMp4 => {
            let graph = format!(
                "[0:a:0]showwaves=s={w}x{h}:mode=cline:rate=30:colors={color},format=rgba[fg];color=c={bg}:s={w}x{h}:r=30[bg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]"
            );
            let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph];
            a.extend(args(&["-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", output]));
            a
        }
    }
}

pub fn bleep_args(input: &str, output: &str, f: &MediaFacts, o: &AudioBleepOptions, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let expr = o.ranges.iter().map(|r| format!("between(t,{},{})", t3(r.start_sec), t3(r.end_sec))).collect::<Vec<_>>().join("+");
    let layout = if f.channels.unwrap_or(2) >= 2 { "stereo" } else { "mono" };
    let sr = f.sample_rate.filter(|v| *v > 0).unwrap_or(44100);
    let graph = if o.sound == BleepSound::Silence {
        format!("[0:a:0]volume=volume=0:enable='{expr}'[out]")
    } else {
        format!(
            "[0:a:0]aformat=channel_layouts={layout},volume=volume=0:enable='{expr}'[m];sine=frequency={}:sample_rate={sr},aformat=channel_layouts={layout},volume=volume=0.35,volume=volume=0:enable='not({expr})'[t];[m][t]amix=inputs=2:duration=first:normalize=0[out]",
            js_num(o.frequency)
        )
    };
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph, "-map".into(), "[out]".into(), "-map_metadata".into(), "0".into()];
    a.extend(audio_codec_args(fmt, q, f)?);
    a.push(output.into());
    Ok(a)
}

/// `tags` in the UI's order.
#[allow(clippy::too_many_arguments)]
pub fn audio_metadata_args(input: &str, output: &str, remove_all: bool, remove_cover: bool, tags: &[(String, String)], fmt: Fmt, has_cover: bool, cover_jpg: Option<&str>) -> Vec<String> {
    let cover_ok = matches!(fmt, Fmt::Mp3 | Fmt::M4a | Fmt::Flac);
    let mut a = args(&["-i", input]);
    if let (Some(c), true) = (cover_jpg, cover_ok) {
        a.extend(args(&["-i", c]));
    }
    a.extend(args(&["-map", "0:a:0"]));
    if cover_jpg.is_some() && cover_ok {
        a.extend(args(&["-map", "1:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    } else if has_cover && cover_ok && !remove_cover && !remove_all {
        a.extend(args(&["-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    }
    a.extend(args(&["-c:a", "copy", "-map_metadata", if remove_all { "-1" } else { "0" }]));
    for (k, v) in tags {
        a.push("-metadata".into());
        a.push(format!("{k}={v}"));
    }
    if fmt == Fmt::Mp3 {
        a.extend(args(&["-id3v2_version", "3", "-write_id3v1", "1"]));
    }
    if fmt == Fmt::M4a {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    a.push(output.into());
    a
}

pub fn join_audio_args(inputs: &[String], output: &str, fmt: Fmt, q: Quality, f: &MediaFacts) -> Result<Vec<String>, String> {
    let mut a: Vec<String> = Vec::new();
    for p in inputs {
        a.push("-i".into());
        a.push(p.clone());
    }
    let pre = (0..inputs.len()).map(|i| format!("[{i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]")).collect::<Vec<_>>().join(";");
    let labels: String = (0..inputs.len()).map(|i| format!("[a{i}]")).collect();
    let cat = format!("{labels}concat=n={}:v=0:a=1[out]", inputs.len());
    a.push("-filter_complex".into());
    a.push(format!("{pre};{cat}"));
    a.extend(args(&["-map", "[out]"]));
    let joined = MediaFacts { sample_rate: Some(48000), channels: Some(2), ..f.clone() };
    a.extend(audio_codec_args(fmt, q, &joined)?);
    a.push(output.into());
    Ok(a)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg_args::test_facts;
    use crate::options::TimeRangeSec;

    fn facts() -> MediaFacts {
        MediaFacts { container: "wav".into(), has_video: false, video_codec: None, audio_codec: Some("pcm_s16le".into()), sample_rate: Some(44100), width: None, height: None, fps: None, ..test_facts() }
    }
    const Q: Quality = Quality { crf: 23.0, audio_kbps: 192.0 };
    fn last_value<'a>(a: &'a [String], flag: &str) -> Option<&'a str> {
        let i = a.iter().rposition(|x| x == flag)?;
        a.get(i + 1).map(|s| s.as_str())
    }
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn compress() {
        assert_eq!(compress_out_fmt(Fmt::Wav, AudioCompressFormat::Keep), Fmt::Mp3);
        assert_eq!(compress_out_fmt(Fmt::Flac, AudioCompressFormat::Keep), Fmt::Mp3);
        assert_eq!(compress_out_fmt(Fmt::Ogg, AudioCompressFormat::Keep), Fmt::Ogg);
        assert_eq!(compress_out_fmt(Fmt::Wav, AudioCompressFormat::Opus), Fmt::Opus);
        let a = compress_audio_args("i.wav", "o.mp3", 128.0, true, Fmt::Mp3).unwrap();
        assert!(has(&a, "libmp3lame"));
        assert_eq!(last_value(&a, "-b:a"), Some("128k"));
        assert_eq!(last_value(&a, "-ac"), Some("1"));
        assert!(compress_audio_args("i", "o", 128.0, false, Fmt::Wav).is_err());
    }

    #[test]
    fn loudnorm() {
        let o = AudioNormalizeOptions { target: -16.0, true_peak: -1.5 };
        assert!(loudnorm_pass1("i.wav", &o).join(" ").contains("print_format=json"));
        let s = parse_loudnorm("junk\n{\n\"input_i\" : \"-23.0\", \"input_tp\":\"-5.0\",\"input_lra\":\"3.0\",\"input_thresh\":\"-33.0\",\"target_offset\":\"0.1\"\n}").unwrap();
        assert_eq!(s.input_i, "-23.0");
        assert!(parse_loudnorm("no json here").is_none());
        let stats = LoudnormStats { input_i: "-23".into(), input_tp: "-5".into(), input_lra: "3".into(), input_thresh: "-33".into(), target_offset: "0.1".into() };
        let a = loudnorm_pass2("i.wav", "o.opus", &facts(), &o, &stats, Fmt::Opus, Q).unwrap();
        assert_eq!(last_value(&a, "-ar"), Some("48000"));
        assert!(a.join(" ").contains("measured_I=-23"));
        assert!(a.join(" ").contains("loudnorm=I=-16:TP=-1.5"));
    }

    #[test]
    fn trim_channels_bleep_visualize_metadata_join() {
        let trim = |fade_out: f64| AudioTrimOptions { start_sec: 0.0, end_sec: 2.0, fade_in_sec: 0.0, fade_out_sec: fade_out };
        assert!(has(&trim_audio_args("i", "o", &facts(), &trim(0.0), Fmt::Wav, Q).unwrap(), "copy"));
        let faded = trim_audio_args("i", "o", &facts(), &trim(1.0), Fmt::Wav, Q).unwrap();
        assert!(faded.join(" ").contains("afade=t=out:st=1.000") && !has(&faded, "copy"));
        let six = MediaFacts { channels: Some(6), ..facts() };
        assert_eq!(last_value(&channels_args("i", "o", &six, ChannelMode::Mono, Fmt::Mp3, Q).unwrap(), "-ac"), Some("1"));
        assert!(channels_args("i", "o", &facts(), ChannelMode::Swap, Fmt::Wav, Q).unwrap().join(" ").contains("pan=stereo|c0=c1|c1=c0"));
        let bleep = AudioBleepOptions {
            ranges: vec![TimeRangeSec { start_sec: 1.0, end_sec: 2.0 }, TimeRangeSec { start_sec: 3.0, end_sec: 3.5 }],
            sound: BleepSound::Beep,
            frequency: 1000.0,
        };
        let b = bleep_args("i", "o", &facts(), &bleep, Fmt::Wav, Q).unwrap().join(" ");
        assert!(b.contains("between(t,1.000,2.000)+between(t,3.000,3.500)") && b.contains("amix"));
        let silence = AudioBleepOptions { sound: BleepSound::Silence, ..bleep };
        assert!(!bleep_args("i", "o", &facts(), &silence, Fmt::Wav, Q).unwrap().join(" ").contains("amix"));
        let v = |kind| AudioVisualizeOptions { kind, width: 1920.0, height: 480.0, color: "#FF5A1F".into(), background: "#FFFFFF".into() };
        assert!(visualize_args("i", "o.png", &v(VisualizeKind::WaveformPng)).join(" ").contains("showwavespic=s=1920x480:colors=0xFF5A1F"));
        assert!(visualize_args("i", "o.png", &v(VisualizeKind::SpectrogramPng)).join(" ").contains("showspectrumpic"));
        assert!(has(&visualize_args("i", "o.mp4", &v(VisualizeKind::WaveformMp4)), "libx264"));
        let tags = vec![("title".to_string(), "Song".to_string())];
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, true, None), "attached_pic"));
        assert!(!has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Wav, true, None), "attached_pic"));
        assert!(!has(&audio_metadata_args("i", "o", true, false, &tags, Fmt::Mp3, true, None), "attached_pic"));
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, false, Some("c.jpg")), "1:0"));
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, false, None), "title=Song"));
        let j = join_audio_args(&["a.wav".into(), "b.mp3".into()], "o.mp3", Fmt::Mp3, Q, &facts()).unwrap();
        assert_eq!(j.iter().filter(|x| *x == "-i").count(), 2);
        assert!(j.join(" ").contains("concat=n=2:v=0:a=1[out]"));
    }
}
