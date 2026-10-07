//! Port of src/main/converters/av.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::{audio_convert_args, can_remux, to_facts, video_convert_args, GifOptions, Quality};
use alohamora_core::options::{convert_defaults, ConvertOptions};
use alohamora_core::registry::{category_of, output_ext};
use alohamora_core::types::{Category, FileInfo, Fmt};

use crate::ffmpeg::{probe, run_ffmpeg, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::tools::video::run_with_hw_fallback;
use crate::{AppError, Result};

pub fn convert_av(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let facts = to_facts(&probe(Path::new(&file.path))?);
    let target_cat = category_of(target);
    if target_cat == Category::Audio && !facts.has_audio {
        return Err(AppError::user(format!("{} has no audio track.", file.name)));
    }
    if target_cat == Category::Video && !facts.has_video {
        return Err(AppError::user(format!("{} has no video track.", file.name)));
    }
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, output_ext(target))));
    let q = Quality { crf: ctx.settings.video_crf, audio_kbps: ctx.settings.audio_bitrate_kbps };
    let d = convert_defaults();
    let gif = GifOptions { width: opts.gif_width.unwrap_or(d.gif_width), fps: opts.gif_fps.unwrap_or(d.gif_fps) };
    let progress = |p: f64| ctx.progress(p, None);
    if file.category == Some(Category::Audio) {
        let a = audio_convert_args(&file.path, &out, &facts, target, q, true).map_err(AppError::other)?;
        run_ffmpeg(&a, FfmpegRun { duration_sec: Some(facts.duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) })?;
    } else {
        run_with_hw_fallback(ctx, facts.duration_sec, &|hw| video_convert_args(&file.path, &out, &facts, target, q, gif, hw).map_err(AppError::other))?;
        if can_remux(&facts, target) {
            ctx.note("Copied streams without re-encoding");
        }
    }
    Ok(())
}
