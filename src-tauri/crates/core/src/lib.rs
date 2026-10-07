//! Pure logic shared by the engine and the app: no file I/O, no processes, no Tauri.
//! Every module here is a port of a TypeScript file named in its header comment.

pub mod collage_layout;
pub mod edit_pipeline;
pub mod error;
pub mod ffmpeg_args;
pub mod ffmpeg_parse;
pub mod geometry;
pub mod image_meta;
pub mod js;
pub mod naming;
pub mod options;
pub mod page_ranges;
pub mod pdf_reflow;
pub mod pdf_split;
pub mod registry;
pub mod split;
pub mod subtitles;
pub mod text;
pub mod time;
pub mod types;
pub mod util;
