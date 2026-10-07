//! Port of src/main/tools/subtitle/shift.ts.

use alohamora_core::js::js_num;
use alohamora_core::options::{with_defaults, SubtitleShiftOptions};
use alohamora_core::subtitles::{parse_subtitles, shift_cues, to_srt, to_vtt};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn shift(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: SubtitleShiftOptions = with_defaults(ToolId::SubtitleShift, options);
    let cues = parse_subtitles(&decode_text(&std::fs::read(&file.path)?));
    if cues.is_empty() {
        return Err(AppError::user(format!("No subtitles were found in {}.", file.name)));
    }
    let shifted = shift_cues(&cues, o.offset_ms / 1000.0);
    let vtt = file.fmt == Some(Fmt::Vtt);
    let text = if vtt { to_vtt(&shifted) } else { format!("\u{FEFF}{}", to_srt(&shifted)) };
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, if vtt { "vtt" } else { "srt" }).suffix("shifted")), text)?;
    ctx.note(format!("{} subtitles shifted by {} ms", shifted.len(), js_num(o.offset_ms)));
    Ok(())
}
