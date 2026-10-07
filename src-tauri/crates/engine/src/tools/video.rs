//! Port of src/main/tools/video/*.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::video::{
    can_concat_copy, compress_plan, concat_args, concat_list_file, crop_args, frames_every_args, metadata_args, mute_args, narrow_maps,
    normalize_clip_args, redact_args, snapshot_args, speed_args, target_video_kbps, trim_args, PixelRegion,
};
use alohamora_core::ffmpeg_args::{to_facts, MediaFacts, Quality};
use alohamora_core::geometry::{clamp_norm_rect, is_full_rect, to_pixel_rect};
use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::options::*;
use alohamora_core::split::split_segments;
use alohamora_core::time::{format_bytes, format_duration};
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::{order_files, tag_pairs};
use crate::ffmpeg::{probe, run_ffmpeg, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::{AppError, Result};

pub fn video_facts(file: &FileInfo) -> Result<MediaFacts> {
    let f = to_facts(&probe(Path::new(&file.path))?);
    if !f.has_video {
        return Err(AppError::user(format!("{} has no video track.", file.name)));
    }
    Ok(f)
}

/// Tools re-encode at high quality to avoid visible generation loss.
pub fn tool_quality(ctx: &JobContext) -> Quality {
    Quality { crf: ctx.settings.video_crf.min(20.0), audio_kbps: ctx.settings.audio_bitrate_kbps }
}

/// Tools keep the input container so users get back what they gave.
pub fn same_fmt(file: &FileInfo) -> Fmt {
    file.fmt.unwrap_or(Fmt::Mp4)
}

/// The verified hardware H.264 encoder for this job, or None for the CPU.
pub fn hw_for(ctx: &JobContext) -> Option<String> {
    if ctx.settings.hardware_video { ctx.caps.hw_video.clone() } else { None }
}

/// Run FFmpeg with the hardware encoder; if that fails, retry once on the CPU and say so on the Done card.
pub fn run_with_hw_fallback(ctx: &JobContext, duration_sec: f64, build: &dyn Fn(Option<&str>) -> Result<Vec<String>>) -> Result<()> {
    run_with_hw_fallback_scaled(ctx, duration_sec, &|p| p, build)
}

/// Same, with `scale` mapping this run's 0..1 progress into the subtask (for multi-part tools like Split).
pub fn run_with_hw_fallback_scaled(ctx: &JobContext, duration_sec: f64, scale: &dyn Fn(f64) -> f64, build: &dyn Fn(Option<&str>) -> Result<Vec<String>>) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    let run = |args: Vec<String>| run_ffmpeg(&args, FfmpegRun { duration_sec: Some(duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) });
    let hw = hw_for(ctx);
    match run(build(hw.as_deref())?) {
        Ok(()) => Ok(()),
        Err(e) if hw.is_none() || e.is_canceled() || ctx.cancel.is_cancelled() => Err(e),
        Err(_) => {
            ctx.note("Hardware encoder failed — used CPU");
            run(build(None)?)
        }
    }
}

fn ffmpeg_with_progress(ctx: &JobContext, args: &[String], duration_sec: Option<f64>, scale: impl Fn(f64) -> f64) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    run_ffmpeg(args, FfmpegRun { duration_sec, cancel: Some(&ctx.cancel), on_progress: Some(&progress) })
}

fn saved_note(before: u64, after: u64) -> String {
    let pct = js_round((1.0 - after as f64 / before as f64) * 100.0).max(0.0);
    format!("{} → {} (−{}%)", format_bytes(before), format_bytes(after), js_num(pct))
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoCompressOptions = with_defaults(ToolId::VideoCompress, options);
    let f = video_facts(file)?;
    let webm = file.fmt == Some(Fmt::Webm);
    if o.target_size_mb > 0.0 && target_video_kbps(o.target_size_mb, f.duration_sec, 128.0) < 150.0 {
        let min_mb = ((150.0 + 128.0) * f.duration_sec / 8192.0).ceil();
        return Err(AppError::user(format!(
            "{} MB is too small for a {} video. Try at least {} MB.",
            js_num(o.target_size_mb), format_duration(f.duration_sec), js_num(min_mb)
        )));
    }
    let out_path = ctx.new_output(OutputSpec::new(&file.path, if webm { "webm" } else { "mp4" }).suffix("compressed"));
    let out = p2s(&out_path);
    let pass_log = p2s(&ctx.temp_path("pass"));
    let passes = compress_plan(&file.path, &out, &f, &o, webm, &pass_log, None);
    if passes.len() == 1 {
        run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(compress_plan(&file.path, &out, &f, &o, webm, &pass_log, hw).remove(0)))?;
    } else {
        let n = passes.len() as f64;
        for (i, pass) in passes.iter().enumerate() {
            ffmpeg_with_progress(ctx, pass, Some(f.duration_sec), |p| (i as f64 + p) / n)?;
        }
    }
    let before = file.size;
    let after = std::fs::metadata(&out_path)?.len();
    if after >= before && o.target_size_mb == 0.0 {
        ctx.drop_output(&out_path);
        ctx.note("Already well compressed — no smaller file was made.");
        return Ok(());
    }
    ctx.note(saved_note(before, after));
    Ok(())
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: MediaMetadataOptions = with_defaults(ToolId::VideoMetadata, options);
    let f = video_facts(file)?;
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(if o.remove_all { "clean" } else { "meta" })));
    let a = metadata_args(&file.path, &out, o.remove_all, &tag_pairs(&o.tags), fmt);
    match ffmpeg_with_progress(ctx, &a, Some(f.duration_sec), |p| p) {
        Ok(()) => {}
        Err(e) if e.is_canceled() => return Err(e),
        Err(_) => ffmpeg_with_progress(ctx, &narrow_maps(&a), Some(f.duration_sec), |p| p)?,
    }
    ctx.note(if o.remove_all { "Metadata removed" } else { "Metadata updated" });
    Ok(())
}

pub fn mute(file: &FileInfo, ctx: &JobContext) -> Result<()> {
    let f = video_facts(file)?;
    if !f.has_audio {
        return Err(AppError::user(format!("{} has no audio to remove.", file.name)));
    }
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("muted")));
    ffmpeg_with_progress(ctx, &mute_args(&file.path, &out, fmt), Some(f.duration_sec), |p| p)
}

pub fn trim(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoTrimOptions = with_defaults(ToolId::VideoTrim, options);
    let f = video_facts(file)?;
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    if end - o.start_sec < 0.1 {
        return Err(AppError::user("The selection is too short."));
    }
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("trimmed")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, end - o.start_sec, &|hw| Ok(trim_args(&file.path, &out, &f, o.start_sec, end, o.precise, fmt, q, hw)))
}

pub fn crop(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoCropOptions = with_defaults(ToolId::VideoCrop, options);
    let f = video_facts(file)?;
    if is_full_rect(o.rect) {
        return Err(AppError::user("Move the crop handles first — the whole frame is selected."));
    }
    let r = to_pixel_rect(clamp_norm_rect(o.rect), f.width.unwrap_or(0), f.height.unwrap_or(0), true);
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("cropped")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(crop_args(&file.path, &out, &f, r, fmt, q, hw)))?;
    ctx.note(format!("{} × {} px", r.w, r.h));
    Ok(())
}

pub fn speed(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSpeedOptions = with_defaults(ToolId::VideoSpeed, options);
    if !(o.factor >= 0.25 && o.factor <= 4.0) {
        return Err(AppError::user("Speed must be between 0.25× and 4×."));
    }
    let f = video_facts(file)?;
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(&format!("{}x", js_num(o.factor)))));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec / o.factor, &|hw| Ok(speed_args(&file.path, &out, &f, o.factor, o.keep_audio, fmt, q, hw)))
}

pub fn snapshot(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSnapshotOptions = with_defaults(ToolId::VideoSnapshot, options);
    let f = video_facts(file)?;
    let jpg = o.format == StillFormat::Jpg;
    if o.mode == SnapshotMode::Single {
        let suffix = format!("frame-{}s", js_to_fixed(o.time_sec, 2).replace('.', "_"));
        let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, o.format.ext()).suffix(&suffix)));
        let t = o.time_sec.min((f.duration_sec - 0.05).max(0.0));
        return run_ffmpeg(&snapshot_args(&file.path, &out, t, jpg), FfmpegRun { cancel: Some(&ctx.cancel), ..Default::default() });
    }
    let dir = ctx.temp_path("frames");
    std::fs::create_dir_all(&dir)?;
    let pattern = p2s(&dir.join(format!("f-%05d.{}", o.format.ext())));
    ffmpeg_with_progress(ctx, &frames_every_args(&file.path, &pattern, o.every_sec, jpg), Some(f.duration_sec), |p| p)?;
    let mut names: Vec<_> = std::fs::read_dir(&dir)?.flatten().map(|e| e.path()).collect();
    names.sort();
    let total = names.len();
    for (i, src) in names.iter().enumerate() {
        let out = ctx.new_output(OutputSpec::new(&file.path, o.format.ext()).group("frames", i + 1, total));
        std::fs::rename(src, out)?;
    }
    ctx.note(format!("{total} frames"));
    Ok(())
}

pub fn split(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSplitOptions = with_defaults(ToolId::VideoSplit, options);
    let f = video_facts(file)?;
    let segs = split_segments(f.duration_sec, &o);
    if segs.len() < 2 {
        return Err(AppError::user("Add at least one cut point inside the video."));
    }
    let fmt = same_fmt(file);
    let q = tool_quality(ctx);
    for (i, s) in segs.iter().enumerate() {
        ctx.check_cancel()?;
        let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).group("parts", i + 1, segs.len())));
        let n = segs.len() as f64;
        run_with_hw_fallback_scaled(ctx, s.end - s.start, &|p| (i as f64 + p) / n, &|hw| Ok(trim_args(&file.path, &out, &f, s.start, s.end, o.precise, fmt, q, hw)))?;
    }
    ctx.note(format!("{} parts", segs.len()));
    Ok(())
}

pub fn redact(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoRedactOptions = with_defaults(ToolId::VideoRedact, options);
    if o.regions.is_empty() {
        return Err(AppError::user("Draw at least one box over the area to hide."));
    }
    let f = video_facts(file)?;
    let regions: Vec<PixelRegion> = o
        .regions
        .iter()
        .map(|r| PixelRegion {
            rect: to_pixel_rect(clamp_norm_rect(r.rect), f.width.unwrap_or(0), f.height.unwrap_or(0), true),
            style: r.style,
            start_sec: r.start_sec,
            end_sec: r.end_sec,
        })
        .collect();
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("redacted")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(redact_args(&file.path, &out, &f, &regions, fmt, q, hw)))?;
    ctx.note("Metadata removed");
    Ok(())
}

pub fn join(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: JoinOptions = with_defaults(ToolId::VideoJoin, options);
    let ordered = order_files(files, &o.order);
    let facts: Vec<MediaFacts> = ordered.iter().map(video_facts).collect::<Result<_>>()?;
    let first = &ordered[0];
    let total_sec: f64 = facts.iter().map(|f| f.duration_sec).sum();
    if can_concat_copy(&facts) {
        let fmt = same_fmt(first);
        let list = ctx.temp_path("list.txt");
        std::fs::write(&list, concat_list_file(&ordered.iter().map(|f| f.path.clone()).collect::<Vec<_>>()))?;
        let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, fmt.as_str()).suffix("joined")));
        return ffmpeg_with_progress(ctx, &concat_args(&p2s(&list), &out, fmt), Some(total_sec), |p| p);
    }
    // Clips differ: bring every clip to the first clip's size / frame rate, then copy-concat the results.
    let even = |n: u32| (js_round(n as f64 / 2.0) * 2.0).max(2.0) as u32;
    let width = even(facts[0].width.unwrap_or(1280));
    let height = even(facts[0].height.unwrap_or(720));
    let fps = { let r = js_round(facts[0].fps.filter(|v| *v > 0.0).unwrap_or(30.0)).min(60.0); if r > 0.0 { r } else { 30.0 } };
    let mut parts = Vec::new();
    let n = ordered.len() as f64;
    for (i, file) in ordered.iter().enumerate() {
        ctx.check_cancel()?;
        let tmp = ctx.temp_path(&format!("n{i}.mp4"));
        ffmpeg_with_progress(ctx, &normalize_clip_args(&file.path, &p2s(&tmp), &facts[i], width, height, fps), Some(facts[i].duration_sec), |p| ((i as f64 + p) / n) * 0.8)?;
        parts.push(p2s(&tmp));
    }
    let list = ctx.temp_path("list.txt");
    std::fs::write(&list, concat_list_file(&parts))?;
    let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, "mp4").suffix("joined")));
    ffmpeg_with_progress(ctx, &concat_args(&p2s(&list), &out, Fmt::Mp4), Some(total_sec), |p| 0.8 + p * 0.2)?;
    ctx.note("Clips were re-encoded to match");
    Ok(())
}
