//! Port of src/main/converters/subtitle.ts.

use alohamora_core::subtitles::{parse_subtitles, to_plain_text, to_srt, to_vtt};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt};

use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn convert_subtitle(file: &FileInfo, target: Fmt, ctx: &JobContext) -> Result<()> {
    let cues = parse_subtitles(&decode_text(&std::fs::read(&file.path)?));
    if cues.is_empty() {
        return Err(AppError::user(format!("No subtitles were found in {}.", file.name)));
    }
    let text = match target {
        Fmt::Srt => format!("\u{FEFF}{}", to_srt(&cues)),
        Fmt::Vtt => to_vtt(&cues),
        _ => to_plain_text(&cues),
    };
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, target.as_str())), text)?;
    Ok(())
}
