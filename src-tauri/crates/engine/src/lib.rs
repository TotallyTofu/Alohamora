//! Everything that touches files, processes and libraries. No Tauri here: the app crate calls into this.
//! The engine is synchronous on purpose: long work runs on plain threads, cancellation uses `CancelToken`.

pub mod cancel;
pub mod capabilities;
pub mod convert;
pub mod docx;
pub mod epub;
pub mod ffmpeg;
pub mod fsutil;
pub mod hw_video;
pub mod image;
pub mod image_preview;
pub mod inspect;
pub mod jobs;
pub mod metadata;
pub mod ocr;
pub mod par;
pub mod pdf;
pub mod previews;
pub mod paths;
pub mod process;
pub mod selftest;
pub mod settings;
pub mod text_pdf;
pub mod thumbnails;
pub mod tools;

pub use alohamora_core as core;
pub use alohamora_core::error::{AppError, Result};
