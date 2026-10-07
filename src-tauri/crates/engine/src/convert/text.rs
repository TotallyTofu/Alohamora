//! Port of src/main/converters/text.ts. TXT → PDF uses Typst (crate::text_pdf) instead of Chromium printing.

use alohamora_core::options::{convert_defaults, ConvertOptions, CueTiming};
use alohamora_core::subtitles::{text_to_cues, to_srt, to_vtt, CueTimingMode, TextToCuesOptions};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt};

use crate::convert::pdf::pdf_to_images;
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn read_text(file: &FileInfo) -> Result<String> {
    Ok(decode_text(&std::fs::read(&file.path)?))
}

pub fn convert_text(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let text = read_text(file)?;
    let d = convert_defaults();
    match target {
        Fmt::Srt | Fmt::Vtt => {
            let timing = match opts.cue_timing.unwrap_or(d.cue_timing) {
                CueTiming::Reading => CueTimingMode::Reading,
                CueTiming::Fixed => CueTimingMode::Fixed,
            };
            let cues = text_to_cues(&text, &TextToCuesOptions { timing, seconds_per_cue: opts.seconds_per_cue.unwrap_or(d.seconds_per_cue) });
            if cues.is_empty() {
                return Err(AppError::user("This text file is empty."));
            }
            let body = if target == Fmt::Srt { format!("\u{FEFF}{}", to_srt(&cues)) } else { to_vtt(&cues) };
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, target.as_str())), body)?;
            Ok(())
        }
        Fmt::Pdf => {
            let pdf = crate::text_pdf::text_to_pdf(&text, &file.name, opts)?;
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf")), pdf)?;
            Ok(())
        }
        Fmt::Jpg | Fmt::Png => {
            let pdf_path = ctx.temp_path("text.pdf");
            std::fs::write(&pdf_path, crate::text_pdf::text_to_pdf(&text, &file.name, opts)?)?;
            let still = if target == Fmt::Png { alohamora_core::options::StillFormat::Png } else { alohamora_core::options::StillFormat::Jpg };
            pdf_to_images(&pdf_path, &file.path, still, opts.image_dpi.unwrap_or(d.image_dpi), 0.9, ctx, None)
        }
        other => Err(AppError::user(format!("Converting text to {} is not available yet.", other.as_str().to_uppercase()))),
    }
}
