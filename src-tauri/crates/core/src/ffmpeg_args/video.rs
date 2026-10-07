//! Port of src/main/engines/videoArgs.ts: argument builders for the video tools.

use super::{args, hw_h264_args, video_encode_args, video_filter, AudioMode, GifOptions, MediaFacts, Quality, EVEN_SCALE};
use crate::geometry::PixelRect;
use crate::js::{js_num, js_round, js_to_fixed};
use crate::options::{CompressPreset, RedactStyle, VideoCodec, VideoCompressOptions};
use crate::types::Fmt;

fn t3(s: f64) -> String {
    js_to_fixed(s, 3)
}

fn faststart(fmt: Fmt) -> Vec<String> {
    if fmt == Fmt::Mp4 || fmt == Fmt::Mov { args(&["-movflags", "+faststart"]) } else { vec![] }
}

fn audio_map(fmt: Fmt) -> Vec<String> {
    if fmt == Fmt::Gif { vec![] } else { args(&["-map", "0:a:0?"]) }
}

/// GIF options used by the tools: original width, the source frame rate.
fn tool_gif(f: &MediaFacts) -> GifOptions {
    let fps = f.fps.filter(|v| *v > 0.0).unwrap_or(12.0);
    GifOptions { width: 0.0, fps: js_round(fps) }
}

pub fn preset_crf(p: CompressPreset) -> f64 {
    match p {
        CompressPreset::High => 20.0,
        CompressPreset::Balanced => 24.0,
        CompressPreset::Small => 28.0,
    }
}

/// New size with the SHORT side capped at max_short (even numbers); None = unchanged.
pub fn cap_size(w: u32, h: u32, max_short: f64) -> Option<(u32, u32)> {
    let short = w.min(h) as f64;
    if max_short <= 0.0 || short <= max_short {
        return None;
    }
    let k = max_short / short;
    let even = |n: u32| (js_round(n as f64 * k / 2.0) * 2.0).max(2.0) as u32;
    Some((even(w), even(h)))
}

/// kbit/s for the video stream so that the whole file is ≈ target_mb.
pub fn target_video_kbps(target_mb: f64, duration_sec: f64, audio_kbps: f64) -> f64 {
    ((target_mb * 8192.0) / duration_sec.max(1.0) - audio_kbps).floor()
}

/// One or two FFmpeg runs (two = target-size two-pass). `out_webm` = output is WebM (else MP4).
pub fn compress_plan(input: &str, output: &str, f: &MediaFacts, o: &VideoCompressOptions, out_webm: bool, pass_log: &str, hw: Option<&str>) -> Vec<Vec<String>> {
    let size = match (f.width, f.height) {
        (Some(w), Some(h)) => cap_size(w, h, o.max_height),
        _ => None,
    };
    let mut vf: Vec<String> = Vec::new();
    if let Some((w, h)) = size {
        vf.push(format!("scale={w}:{h}"));
    }
    vf.push(EVEN_SCALE.to_string());
    let base = vec!["-i".to_string(), input.into(), "-map".into(), "0:v:0".into(), "-vf".into(), vf.join(",")];
    let audio: Vec<String> = if f.has_audio {
        let mut a = args(&["-map", "0:a:0"]);
        a.extend(if out_webm { args(&["-c:a", "libopus", "-b:a", "96k"]) } else { args(&["-c:a", "aac", "-b:a", "128k"]) });
        a
    } else {
        args(&["-an"])
    };
    let tail = if out_webm { vec![] } else { args(&["-movflags", "+faststart"]) };
    if o.target_size_mb > 0.0 {
        let audio_kbps = if f.has_audio { if out_webm { 96.0 } else { 128.0 } } else { 0.0 };
        let kbps = format!("{}k", js_num(target_video_kbps(o.target_size_mb, f.duration_sec, audio_kbps)));
        let v: Vec<String> = if out_webm {
            vec!["-c:v".into(), "libvpx-vp9".into(), "-b:v".into(), kbps, "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into()]
        } else {
            vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-b:v".into(), kbps, "-pix_fmt".into(), "yuv420p".into()]
        };
        let mut pass1 = base.clone();
        pass1.extend(v.clone());
        pass1.extend(vec!["-pass".into(), "1".into(), "-passlogfile".into(), pass_log.into()]);
        pass1.extend(args(&["-an", "-f", "null", "-"]));
        let mut pass2 = base;
        pass2.extend(v);
        pass2.extend(vec!["-pass".into(), "2".into(), "-passlogfile".into(), pass_log.into()]);
        pass2.extend(audio);
        pass2.extend(tail);
        pass2.push(output.into());
        return vec![pass1, pass2];
    }
    let h265 = !out_webm && o.codec == VideoCodec::H265;
    let crf = preset_crf(o.preset);
    let v: Vec<String> = if out_webm {
        vec!["-c:v".into(), "libvpx-vp9".into(), "-crf".into(), js_num(crf + 9.0), "-b:v".into(), "0".into(), "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into()]
    } else if let (Some(enc), false) = (hw, h265) {
        hw_h264_args(enc, crf) // hardware only in quality mode (no classic two-pass)
    } else {
        let mut v = vec!["-c:v".into(), if h265 { "libx265" } else { "libx264" }.into(), "-preset".into(), "medium".into(), "-crf".into(), js_num(crf + if h265 { 4.0 } else { 0.0 }), "-pix_fmt".into(), "yuv420p".into()];
        if h265 {
            v.extend(args(&["-tag:v", "hvc1"]));
        }
        v
    };
    let mut one = base;
    one.extend(v);
    one.extend(audio);
    one.extend(tail);
    one.push(output.into());
    vec![one]
}

#[allow(clippy::too_many_arguments)]
pub fn trim_args(input: &str, output: &str, f: &MediaFacts, start: f64, end: f64, precise: bool, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let dur = (end - start).max(0.05);
    if !precise && fmt != Fmt::Gif {
        let mut a = vec!["-ss".into(), t3(start), "-i".into(), input.into(), "-t".into(), t3(dur)];
        a.extend(args(&["-map", "0:v?", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero"]));
        a.extend(faststart(fmt));
        a.push(output.into());
        return a;
    }
    let mut a = vec!["-ss".into(), t3(start), "-i".into(), input.into(), "-t".into(), t3(dur), "-map".into(), "0:v:0".into()];
    a.extend(audio_map(fmt));
    a.push("-vf".into());
    a.push(video_filter(fmt, &[], tool_gif(f)));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    a
}

pub fn crop_args(input: &str, output: &str, f: &MediaFacts, r: PixelRect, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0:v:0"]);
    a.extend(audio_map(fmt));
    a.push("-vf".into());
    a.push(video_filter(fmt, &[format!("crop={}:{}:{}:{}", r.w, r.h, r.x, r.y)], tool_gif(f)));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Copy, hw));
    a.push(output.into());
    a
}

pub fn atempo_chain(factor: f64) -> String {
    let mut parts = Vec::new();
    let mut r = factor;
    while r > 2.0 {
        parts.push("atempo=2.0".to_string());
        r /= 2.0;
    }
    while r < 0.5 {
        parts.push("atempo=0.5".to_string());
        r /= 0.5;
    }
    parts.push(format!("atempo={}", js_to_fixed(r, 4)));
    parts.join(",")
}

#[allow(clippy::too_many_arguments)]
pub fn speed_args(input: &str, output: &str, f: &MediaFacts, factor: f64, keep_audio: bool, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let vf = video_filter(fmt, &[format!("setpts=PTS/{}", js_to_fixed(factor, 4))], tool_gif(f));
    if !(keep_audio && f.has_audio && fmt != Fmt::Gif) {
        let mut a = vec!["-i".into(), input.into(), "-map".into(), "0:v:0".into(), "-vf".into(), vf];
        a.extend(video_encode_args(fmt, q, f, AudioMode::None, hw));
        a.push(output.into());
        return a;
    }
    let graph = format!("[0:v:0]{vf}[v];[0:a:0]{}[a]", atempo_chain(factor));
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph, "-map".into(), "[v]".into(), "-map".into(), "[a]".into()];
    a.extend(video_encode_args(fmt, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    a
}

pub fn mute_args(input: &str, output: &str, fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0:v", "-c", "copy", "-an"]);
    a.extend(faststart(fmt));
    a.push(output.into());
    a
}

pub fn snapshot_args(input: &str, output: &str, t: f64, jpg: bool) -> Vec<String> {
    let mut a = vec!["-ss".into(), t3(t.max(0.0)), "-i".into(), input.into(), "-frames:v".into(), "1".into()];
    if jpg {
        a.extend(args(&["-q:v", "2"]));
    }
    a.push(output.into());
    a
}

pub fn frames_every_args(input: &str, pattern: &str, every_sec: f64, jpg: bool) -> Vec<String> {
    let mut a = vec!["-i".into(), input.into(), "-vf".into(), format!("fps=1/{}", js_num(every_sec.max(0.1)))];
    if jpg {
        a.extend(args(&["-q:v", "2"]));
    }
    a.push(pattern.into());
    a
}

#[derive(Debug, Clone, PartialEq)]
pub struct PixelRegion {
    pub rect: PixelRect,
    pub style: RedactStyle,
    pub start_sec: Option<f64>,
    pub end_sec: Option<f64>,
}

/// filter_complex graph applying every region in order; returns (graph, final label).
pub fn redact_graph(regions: &[PixelRegion]) -> (String, String) {
    let mut parts: Vec<String> = Vec::new();
    let mut cur = "0:v:0".to_string();
    for (i, r) in regions.iter().enumerate() {
        let en = match (r.start_sec, r.end_sec) {
            (Some(s), Some(e)) => format!(":enable='between(t,{},{})'", t3(s), t3(e)),
            _ => String::new(),
        };
        let PixelRect { x, y, w, h } = r.rect;
        let out = format!("v{i}");
        if r.style == RedactStyle::Black {
            parts.push(format!("[{cur}]drawbox=x={x}:y={y}:w={w}:h={h}:color=black@1:t=fill{en}[{out}]"));
        } else {
            let fx = if r.style == RedactStyle::Blur {
                format!("gblur=sigma={}", js_num(js_round(w.min(h) as f64 / 6.0).max(8.0)))
            } else {
                let sw = js_round(w as f64 / 12.0).max(1.0);
                let sh = js_round(h as f64 / 12.0).max(1.0);
                format!("scale={}:{}:flags=neighbor,scale={w}:{h}:flags=neighbor", js_num(sw), js_num(sh))
            };
            parts.push(format!("[{cur}]split=2[b{i}][c{i}]"));
            parts.push(format!("[c{i}]crop={w}:{h}:{x}:{y},{fx}[r{i}]"));
            parts.push(format!("[b{i}][r{i}]overlay={x}:{y}{en}[{out}]"));
        }
        cur = out;
    }
    (parts.join(";"), cur)
}

pub fn redact_args(input: &str, output: &str, f: &MediaFacts, regions: &[PixelRegion], fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let (graph, out) = redact_graph(regions);
    let tail = video_filter(fmt, &[], tool_gif(f));
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), format!("{graph};[{out}]{tail}[vout]"), "-map".into(), "[vout]".into()];
    a.extend(audio_map(fmt));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Copy, hw));
    a.extend(args(&["-map_metadata", "-1"]));
    a.push(output.into());
    a
}

/// `tags` in the UI's order. Values are written as `key=value`.
pub fn metadata_args(input: &str, output: &str, remove_all: bool, tags: &[(String, String)], fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0", "-c", "copy", "-map_metadata", if remove_all { "-1" } else { "0" }]);
    if remove_all {
        a.extend(args(&["-map_chapters", "-1", "-fflags", "+bitexact"]));
    }
    for (k, v) in tags {
        a.push("-metadata".into());
        a.push(format!("{k}={v}"));
    }
    if fmt == Fmt::Mp4 || fmt == Fmt::Mov {
        a.push("-movflags".into());
        a.push(if tags.is_empty() { "+faststart" } else { "+faststart+use_metadata_tags" }.into());
    }
    a.push(output.into());
    a
}

/// Some containers reject data streams with `-map 0`; retry with video, audio and subtitle streams only.
pub fn narrow_maps(a: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < a.len() {
        if a[i] == "-map" && a.get(i + 1).map(|s| s.as_str()) == Some("0") {
            out.extend(args(&["-map", "0:v?", "-map", "0:a?", "-map", "0:s?"]));
            i += 2;
        } else {
            out.push(a[i].clone());
            i += 1;
        }
    }
    out
}

pub fn can_concat_copy(list: &[MediaFacts]) -> bool {
    let a = &list[0];
    list.iter().all(|f| {
        f.video_codec == a.video_codec
            && f.width == a.width
            && f.height == a.height
            && (f.fps.unwrap_or(0.0) - a.fps.unwrap_or(0.0)).abs() < 0.01
            && f.has_audio == a.has_audio
            && f.audio_codec == a.audio_codec
            && f.sample_rate == a.sample_rate
            && f.channels == a.channels
    })
}

/// Contents of an FFmpeg concat-demuxer list file.
pub fn concat_list_file(paths: &[String]) -> String {
    paths
        .iter()
        .map(|p| format!("file '{}'", p.replace('\\', "/").replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

pub fn concat_args(list_file: &str, output: &str, fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-f", "concat", "-safe", "0", "-i", list_file, "-map", "0:v?", "-map", "0:a?", "-c", "copy"]);
    a.extend(faststart(fmt));
    a.push(output.into());
    a
}

/// Re-encode a clip to a common size/fps/audio layout so the concat demuxer can copy it.
pub fn normalize_clip_args(input: &str, output: &str, f: &MediaFacts, width: u32, height: u32, fps: f64) -> Vec<String> {
    let vf = format!(
        "scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={}",
        js_num(fps)
    );
    let mut a = args(&["-i", input]);
    if !f.has_audio {
        a.extend(vec!["-f".into(), "lavfi".into(), "-t".into(), t3(f.duration_sec), "-i".into(), "anullsrc=channel_layout=stereo:sample_rate=48000".into()]);
    }
    a.extend(args(&["-map", "0:v:0", "-map", if f.has_audio { "0:a:0" } else { "1:a:0" }, "-vf"]));
    a.push(vf);
    a.extend(args(&["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", output]));
    a
}

#[cfg(test)]
mod tests {
    use super::super::{after, test_facts};
    use super::*;
    use crate::options::{SplitMode, VideoSplitOptions};
    use crate::split::{split_segments, Segment};

    fn facts() -> MediaFacts {
        MediaFacts { duration_sec: 60.0, container: "mov,mp4".into(), width: Some(1920), height: Some(1080), ..test_facts() }
    }
    const Q: Quality = Quality { crf: 20.0, audio_kbps: 192.0 };
    fn compress(preset: CompressPreset, max_height: f64, codec: VideoCodec, target: f64) -> VideoCompressOptions {
        VideoCompressOptions { preset, max_height, codec, target_size_mb: target }
    }
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn caps_and_targets() {
        assert_eq!(cap_size(1920, 1080, 720.0), Some((1280, 720)));
        assert_eq!(cap_size(1080, 1920, 720.0), Some((720, 1280)));
        assert_eq!(cap_size(640, 360, 720.0), None);
        assert_eq!(cap_size(1920, 1080, 0.0), None);
        assert_eq!(target_video_kbps(10.0, 60.0, 128.0), 1237.0);
    }

    #[test]
    fn plans() {
        let one = compress_plan("in.mp4", "out.mp4", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), false, "log", None);
        assert_eq!(one.len(), 1);
        assert!(has(&one[0], "libx264"));
        assert_eq!(after(&one[0], "-crf"), Some("24"));
        let two = compress_plan("in.mp4", "out.mp4", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 10.0), false, "log", None);
        assert_eq!(two.len(), 2);
        assert_eq!(after(&two[0], "-pass"), Some("1"));
        assert_eq!(two[0].last().unwrap(), "-");
        assert_eq!(two[1].last().unwrap(), "out.mp4");
        assert!(has(&compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H265, 0.0), false, "l", None)[0], "libx265"));
        assert!(has(&compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), true, "l", None)[0], "libvpx-vp9"));
        let capped = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 720.0, VideoCodec::H264, 0.0), false, "l", None);
        assert!(after(&capped[0], "-vf").unwrap().contains("scale=1280:720"));
        let hw = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), false, "l", Some("h264_nvenc"));
        assert!(has(&hw[0], "h264_nvenc"));
        let hw2 = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 10.0), false, "l", Some("h264_nvenc"));
        assert!(has(&hw2[0], "libx264"));
    }

    #[test]
    fn split_points() {
        let o = |mode, times: Vec<f64>, parts, every| VideoSplitOptions { mode, times, parts, every_sec: every, precise: false };
        assert_eq!(
            split_segments(9.0, &o(SplitMode::Parts, vec![], 3.0, 60.0)),
            vec![Segment { start: 0.0, end: 3.0 }, Segment { start: 3.0, end: 6.0 }, Segment { start: 6.0, end: 9.0 }]
        );
        let every = split_segments(10.0, &o(SplitMode::Every, vec![], 2.0, 4.0));
        assert_eq!(every.len(), 3);
        assert_eq!(every[2].end, 10.0);
        assert_eq!(split_segments(10.0, &o(SplitMode::At, vec![5.0, 0.0, 20.0], 2.0, 60.0)), vec![Segment { start: 0.0, end: 5.0 }, Segment { start: 5.0, end: 10.0 }]);
    }

    #[test]
    fn tools() {
        assert_eq!(atempo_chain(4.0), "atempo=2.0,atempo=2.0000");
        assert_eq!(atempo_chain(0.25), "atempo=0.5,atempo=0.5000");
        assert_eq!(atempo_chain(1.5), "atempo=1.5000");
        assert!(has(&speed_args("i", "o", &facts(), 2.0, true, Fmt::Mp4, Q, None), "-filter_complex"));
        let mute = speed_args("i", "o", &facts(), 2.0, false, Fmt::Mp4, Q, None);
        assert!(has(&mute, "-vf") && has(&mute, "-an"));
        let m = mute_args("i.mp4", "o.mp4", Fmt::Mp4);
        assert!(has(&m, "-an"));
        assert_eq!(after(&m, "-c"), Some("copy"));
        assert_eq!(after(&trim_args("i", "o", &facts(), 1.0, 3.0, false, Fmt::Mp4, Q, None), "-c"), Some("copy"));
        assert!(has(&trim_args("i", "o", &facts(), 1.0, 3.0, true, Fmt::Mp4, Q, None), "libx264"));
        let c = crop_args("i", "o", &facts(), PixelRect { x: 10, y: 20, w: 100, h: 50 }, Fmt::Mp4, Q, None);
        assert!(after(&c, "-vf").unwrap().contains("crop=100:50:10:20"));
        assert_eq!(after(&metadata_args("i", "o", true, &[], Fmt::Mp4), "-map_metadata"), Some("-1"));
        assert!(has(&metadata_args("i", "o", false, &[("title".into(), "T".into())], Fmt::Mkv), "title=T"));
        assert!(has(&narrow_maps(&metadata_args("i", "o", false, &[], Fmt::Mkv)), "0:s?"));
    }

    #[test]
    fn redact_and_concat() {
        let (graph, out) = redact_graph(&[
            PixelRegion { rect: PixelRect { x: 10, y: 10, w: 200, h: 100 }, style: RedactStyle::Blur, start_sec: None, end_sec: None },
            PixelRegion { rect: PixelRect { x: 0, y: 0, w: 50, h: 50 }, style: RedactStyle::Black, start_sec: Some(1.0), end_sec: Some(2.0) },
        ]);
        assert!(graph.contains("gblur") && graph.contains("drawbox") && graph.contains("[v1]"));
        assert!(graph.contains("enable='between(t,1.000,2.000)'"));
        assert_eq!(out, "v1");
        assert_eq!(concat_list_file(&["C:\\a b\\it's.mp4".to_string()]), "file 'C:/a b/it'\\''s.mp4'\n");
        assert!(can_concat_copy(&[facts(), facts()]));
        assert!(!can_concat_copy(&[facts(), MediaFacts { width: Some(1280), ..facts() }]));
        assert!(!can_concat_copy(&[facts(), MediaFacts { has_audio: false, ..facts() }]));
    }
}
