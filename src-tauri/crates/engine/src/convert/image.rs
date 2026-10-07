//! Port of converters/image.ts.

use std::path::Path;

use alohamora_core::options::{ConvertOptions, SvgMode};
use alohamora_core::types::{FileInfo, Fmt};

use crate::image::encode::{save_as, SaveFmt};
use crate::image::exif::read_source_meta;
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn convert_image(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let quality = opts.quality.unwrap_or(ctx.settings.image_quality);
    let src = Path::new(&file.path);
    let img = crate::image::load(src, file.fmt)?;
    ctx.progress(0.2, None);
    let out = |ext: &str| ctx.new_output(OutputSpec::new(&file.path, ext));
    let raster = |fmt: SaveFmt| -> Result<()> {
        let meta = read_source_meta(src);
        save_as(&img, fmt, &out(fmt.ext()), quality, &ctx.temp_path("heic-src.png"), &ctx.cancel, Some(&meta))
    };
    match target {
        Fmt::Jpg => raster(SaveFmt::Jpg)?,
        Fmt::Png => raster(SaveFmt::Png)?,
        Fmt::Webp => raster(SaveFmt::Webp)?,
        Fmt::Avif => raster(SaveFmt::Avif)?,
        Fmt::Tiff => raster(SaveFmt::Tiff)?,
        Fmt::Bmp => raster(SaveFmt::Bmp)?,
        Fmt::Heic => {
            if !ctx.caps.heif_enc {
                return Err(AppError::user("HEIC output is not available on this computer (see the Formats page)."));
            }
            raster(SaveFmt::Heic)?
        }
        Fmt::Svg => {
            let svg = if opts.svg_mode.unwrap_or(SvgMode::Trace) == SvgMode::Embed {
                crate::image::svg::embed(&img)?
            } else {
                crate::image::svg::trace(&img, opts.svg_colors.unwrap_or(16.0))?
            };
            std::fs::write(out("svg"), svg)?;
        }
        Fmt::Pdf => {
            let pdf = out("pdf");
            crate::pdf::create::images_to_pdf(
                std::slice::from_ref(file), alohamora_core::options::PdfPageSize::Fit, alohamora_core::options::PdfMargin::None,
                &pdf, &|p| ctx.progress(p, None), &ctx.cancel,
            )?;
        }
        Fmt::Docx => {
            let img = crate::pdf::create::embeddable_image(file)?;
            std::fs::write(out("docx"), crate::docx::images_to_docx(&[img])?)?;
        }
        other => return Err(AppError::user(format!("Converting images to {} is not available yet.", other.as_str().to_uppercase()))),
    }
    ctx.progress(1.0, None);
    Ok(())
}
