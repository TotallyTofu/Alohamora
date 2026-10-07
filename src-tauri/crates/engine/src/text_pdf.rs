//! Text → PDF with Typst (replaces Chromium printToPDF of textToHtml). Fully offline:
//! no package downloads (typst-as-lib without the `packages` feature), fonts = bundled + system.

use std::sync::OnceLock;

use alohamora_core::options::{ConvertOptions, PageSize, TextFont, TextSize};
use alohamora_core::text::text_size_pt;
use typst::foundations::{Array, Dict, IntoValue};
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::{TypstEngine, TypstTemplateMainFile};

use crate::{AppError, Result};

/// Page: 16 mm left/right, 18 mm top/bottom like the Electron @page rule. Text is drawn line by line
/// so spaces and empty lines are kept (CSS `white-space: pre-wrap`).
const TEMPLATE: &str = r##"#import sys: inputs
#set document(title: inputs.title)
#set page(paper: inputs.paper, margin: (x: 16mm, y: 18mm))
#set text(font: inputs.fonts, size: inputs.size * 1pt, fill: rgb("#111111"), hyphenate: false)
#set par(justify: false, leading: 0.7em, spacing: 0.7em)
#for line in inputs.lines {
  line
  linebreak()
}
"##;

fn engine() -> &'static TypstEngine<TypstTemplateMainFile> {
    static ENGINE: OnceLock<TypstEngine<TypstTemplateMainFile>> = OnceLock::new();
    ENGINE.get_or_init(|| {
        TypstEngine::builder()
            .main_file(TEMPLATE)
            .search_fonts_with(
                TypstKitFontOptions::default()
                    .include_system_fonts(true)
                    .include_dirs([crate::paths::fonts_dir()]),
            )
            .build()
    })
}

/// Bundled family first, then common fallbacks; Typst also falls back to any font that has the glyph.
fn font_families(font: TextFont) -> Vec<&'static str> {
    match font {
        TextFont::Sans => vec!["Noto Sans", "DejaVu Sans", "Arial", "Helvetica"],
        TextFont::Serif => vec!["Noto Serif", "DejaVu Serif", "Times New Roman", "Times"],
        TextFont::Mono | TextFont::Original => vec!["Noto Sans Mono", "DejaVu Sans Mono", "Consolas", "Menlo"],
    }
}

fn paper(size: PageSize) -> &'static str {
    match size {
        PageSize::A4 => "a4",
        PageSize::Letter => "us-letter",
        PageSize::A5 => "a5",
    }
}

/// Tabs become 8 spaces; very long runs without spaces get invisible break points (CSS `overflow-wrap: anywhere`).
fn prepare_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut run = 0;
    for ch in line.replace('\t', "        ").chars() {
        if ch.is_whitespace() {
            run = 0;
        } else {
            run += 1;
            if run > 40 {
                out.push('\u{200B}');
                run = 1;
            }
        }
        out.push(ch);
    }
    out
}

/// Typeset `text` with the convert options (font, text size, page size) and return PDF bytes.
pub fn text_to_pdf(text: &str, title: &str, opts: &ConvertOptions) -> Result<Vec<u8>> {
    let font = opts.font.unwrap_or(TextFont::Mono);
    let size = text_size_pt(opts.text_size.unwrap_or(TextSize::Medium));
    text_to_pdf_with(text, title, font, size, opts.page_size.unwrap_or(PageSize::A4))
}

/// Typeset `text` and return PDF bytes. `title` goes into the PDF document title.
pub fn text_to_pdf_with(text: &str, title: &str, font: TextFont, size_pt: f64, page: PageSize) -> Result<Vec<u8>> {
    let lines: Array = text.replace("\r\n", "\n").replace('\r', "\n").split('\n').map(|l| prepare_line(l).into_value()).collect();
    let fonts: Array = font_families(font).into_iter().map(|f| f.into_value()).collect();
    let mut inputs = Dict::new();
    inputs.insert("title".into(), title.into_value());
    inputs.insert("paper".into(), paper(page).into_value());
    inputs.insert("size".into(), size_pt.into_value());
    inputs.insert("fonts".into(), fonts.into_value());
    inputs.insert("lines".into(), lines.into_value());
    // The document type (PagedDocument) is inferred from typst_pdf::pdf below.
    let doc = engine()
        .compile_with_input(inputs)
        .output
        .map_err(|e| AppError::tool("Could not lay out the text as a PDF", format!("{e:?}")))?;
    typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
        .map_err(|e| AppError::tool("Could not write the PDF", format!("{e:?}")))
}
