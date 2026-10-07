//! Port of src/main/converters/*: one converter per input category.

pub mod av;
pub mod image;
pub mod pdf;
pub mod subtitle;
pub mod text;

use alohamora_core::options::ConvertOptions;
use alohamora_core::types::{Category, FileInfo, Fmt};

use crate::jobs::JobContext;
use crate::{AppError, Result};

pub fn convert(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    match file.category {
        Some(Category::Audio) | Some(Category::Video) => av::convert_av(file, target, opts, ctx),
        Some(Category::Image) => image::convert_image(file, target, opts, ctx),
        Some(Category::Pdf) => pdf::convert_pdf(file, target, opts, ctx),
        Some(Category::Text) => text::convert_text(file, target, opts, ctx),
        Some(Category::Subtitle) => subtitle::convert_subtitle(file, target, ctx),
        None => Err(AppError::user(format!("{} is not a supported file type.", file.name))),
    }
}
