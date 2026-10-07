//! Port of src/main/tools/audio/*.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::audio::{
    audio_metadata_args, bleep_args, channels_args, compress_audio_args, compress_out_fmt, join_audio_args, loudnorm_pass1, loudnorm_pass2,
    parse_loudnorm, trim_audio_args, visualize_args,
};
use alohamora_core::ffmpeg_args::{to_facts, MediaFacts, Quality};
use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::options::*;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::{order_files, tag_pairs};
use crate::ffmpeg::{probe, run_ffmpeg, run_ffmpeg_capture, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::process::last_lines;
use crate::{AppError, Result};

pub fn audio_facts(file: &FileInfo) -> Result<MediaFacts> {
    let f = to_facts(&probe(Path::new(&file.path))?);
    if !f.has_audio {
        return Err(AppError::user(format!("{} has no audio track.", file.name)));
    }
    Ok(f)
}

/// Audio tools re-encode at a generous bitrate to avoid audible generation loss.
pub fn tool_audio_quality(ctx: &JobContext) -> Quality {
    Quality { crf: 23.0, audio_kbps: ctx.settings.audio_bitrate_kbps.max(192.0) }
}

/// Tools keep the input container so users get back what they gave.
pub fn same_audio_fmt(file: &FileInfo) -> Fmt {
    file.fmt.unwrap_or(Fmt::Mp3)
}

fn run(ctx: &JobContext, args: &[String], duration_sec: Option<f64>, scale: impl Fn(f64) -> f64) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    run_ffmpeg(args, FfmpegRun { duration_sec, cancel: Some(&ctx.cancel), on_progress: Some(&progress) })
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioCompressOptions = with_defaults(ToolId::AudioCompress, options);
    let f = audio_facts(file)?;
    let out_fmt = compress_out_fmt(same_audio_fmt(file), o.format);
    let out_path = ctx.new_output(OutputSpec::new(&file.path, out_fmt.as_str()).suffix("compressed"));
    let a = compress_audio_args(&file.path, &p2s(&out_path), o.bitrate_kbps, o.mono, out_fmt).map_err(AppError::other)?;
    run(ctx, &a, Some(f.duration_sec), |p| p)?;
    let after = std::fs::metadata(&out_path)?.len();
    if after >= file.size {
        ctx.drop_output(&out_path);
        ctx.note("Already small — no smaller file was made");
        return Ok(());
    }
    let pct = js_round((1.0 - after as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(after), js_num(pct)));
    Ok(())
}

pub fn normalize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioNormalizeOptions = with_defaults(ToolId::AudioNormalize, options);
    let f = audio_facts(file)?;
    ctx.progress(0.25, Some("Measuring loudness".into()));
    let stderr = run_ffmpeg_capture(&loudnorm_pass1(&file.path, &o), Some(&ctx.cancel))?;
    let stats = parse_loudnorm(&stderr).ok_or_else(|| AppError::tool("Could not measure loudness", last_lines(&stderr, 15)))?;
    let measured: f64 = stats.input_i.parse().unwrap_or(f64::NAN);
    if stats.input_i == "-inf" || !measured.is_finite() {
        return Err(AppError::user("This file is silent."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("normalized")));
    let a = loudnorm_pass2(&file.path, &out, &f, &o, &stats, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    let progress = |p: f64| ctx.progress(0.5 + p * 0.5, Some("Normalizing".into()));
    run_ffmpeg(&a, FfmpegRun { duration_sec: Some(f.duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) })?;
    ctx.note(format!("{} LUFS → {} LUFS", js_to_fixed(measured, 1), js_num(o.target)));
    Ok(())
}

pub fn trim(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioTrimOptions = with_defaults(ToolId::AudioTrim, options);
    let f = audio_facts(file)?;
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    if end - o.start_sec < 0.1 {
        return Err(AppError::user("The selection is too short."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("trimmed")));
    let a = trim_audio_args(&file.path, &out, &f, &o, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    run(ctx, &a, Some(end - o.start_sec), |p| p)
}

pub fn channels(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioChannelsOptions = with_defaults(ToolId::AudioChannels, options);
    let f = audio_facts(file)?;
    if matches!(o.mode, ChannelMode::Left | ChannelMode::Right | ChannelMode::Swap) && f.channels.unwrap_or(2) < 2 {
        return Err(AppError::user("This file is mono."));
    }
    let suffix = match o.mode {
        ChannelMode::Mono => "mono",
        ChannelMode::Stereo => "stereo",
        ChannelMode::Left => "left",
        ChannelMode::Right => "right",
        ChannelMode::Swap => "swapped",
    };
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(suffix)));
    let a = channels_args(&file.path, &out, &f, o.mode, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    run(ctx, &a, Some(f.duration_sec), |p| p)
}

pub fn visualize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioVisualizeOptions = with_defaults(ToolId::AudioVisualize, options);
    let f = audio_facts(file)?;
    let (ext, suffix) = match o.kind {
        VisualizeKind::WaveformMp4 => ("mp4", "waveform"),
        VisualizeKind::SpectrogramPng => ("png", "spectrogram"),
        VisualizeKind::WaveformPng => ("png", "waveform"),
    };
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, ext).suffix(suffix)));
    let duration = if o.kind == VisualizeKind::WaveformMp4 { Some(f.duration_sec) } else { None };
    run(ctx, &visualize_args(&file.path, &out, &o), duration, |p| p)
}

pub fn bleep(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let mut o: AudioBleepOptions = with_defaults(ToolId::AudioBleep, options);
    let f = audio_facts(file)?;
    o.ranges = o
        .ranges
        .iter()
        .map(|r| TimeRangeSec { start_sec: r.start_sec.max(0.0), end_sec: r.end_sec.min(f.duration_sec) })
        .filter(|r| r.end_sec - r.start_sec > 0.01)
        .collect();
    if o.ranges.is_empty() {
        return Err(AppError::user("Add at least one part to bleep."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("bleeped")));
    run(ctx, &bleep_args(&file.path, &out, &f, &o, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?, Some(f.duration_sec), |p| p)?;
    let n = o.ranges.len();
    ctx.note(format!("{n} part{} {}", if n == 1 { "" } else { "s" }, if o.sound == BleepSound::Beep { "bleeped" } else { "silenced" }));
    Ok(())
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: MediaMetadataOptions = with_defaults(ToolId::AudioMetadata, options);
    let f = audio_facts(file)?;
    let fmt = same_audio_fmt(file);
    let mut cover_jpg: Option<String> = None;
    if let Some(cover) = &o.cover_path {
        if matches!(fmt, Fmt::Mp3 | Fmt::M4a | Fmt::Flac) {
            let p = ctx.temp_path("cover.jpg");
            crate::image::cover_art_jpeg(Path::new(cover), &p)?;
            cover_jpg = Some(p2s(&p));
        } else {
            ctx.note("Cover art isn't supported for this format");
        }
    }
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(if o.remove_all { "clean" } else { "meta" })));
    let a = audio_metadata_args(&file.path, &out, o.remove_all, o.remove_cover, &tag_pairs(&o.tags), fmt, f.has_cover, cover_jpg.as_deref());
    run(ctx, &a, Some(f.duration_sec), |p| p)?;
    ctx.note(if o.remove_all { "Metadata removed" } else { "Metadata updated" });
    Ok(())
}

pub fn join(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: JoinOptions = with_defaults(ToolId::AudioJoin, options);
    let ordered = order_files(files, &o.order);
    let facts: Vec<MediaFacts> = ordered.iter().map(audio_facts).collect::<Result<_>>()?;
    let first = &ordered[0];
    let fmt = same_audio_fmt(first);
    let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, fmt.as_str()).suffix("joined")));
    let total: f64 = facts.iter().map(|f| f.duration_sec).sum();
    let inputs: Vec<String> = ordered.iter().map(|f| f.path.clone()).collect();
    let a = join_audio_args(&inputs, &out, fmt, tool_audio_quality(ctx), &facts[0]).map_err(AppError::other)?;
    run(ctx, &a, Some(total), |p| p)
}
