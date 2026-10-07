//! Port of src/shared/types.ts. These structs are the IPC contract with the UI:
//! field names are camelCase on the wire, exactly like the TypeScript types.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::options::ConvertOptions;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Image,
    Video,
    Audio,
    Pdf,
    Text,
    Subtitle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fmt {
    Jpg, Png, Webp, Heic, Tiff, Svg, Avif, Bmp,
    Mp3, M4a, Wav, Flac, Ogg, Opus, Aiff, Wma,
    Mp4, Mov, Mkv, Webm, Avi, Wmv, Gif,
    Pdf, Docx, Epub, Txt, Srt, Vtt,
}

impl Fmt {
    pub const ALL: [Fmt; 29] = [
        Fmt::Jpg, Fmt::Png, Fmt::Webp, Fmt::Heic, Fmt::Tiff, Fmt::Svg, Fmt::Avif, Fmt::Bmp,
        Fmt::Mp3, Fmt::M4a, Fmt::Wav, Fmt::Flac, Fmt::Ogg, Fmt::Opus, Fmt::Aiff, Fmt::Wma,
        Fmt::Mp4, Fmt::Mov, Fmt::Mkv, Fmt::Webm, Fmt::Avi, Fmt::Wmv, Fmt::Gif,
        Fmt::Pdf, Fmt::Docx, Fmt::Epub, Fmt::Txt, Fmt::Srt, Fmt::Vtt,
    ];

    /// The id used in JSON and in the registry, e.g. `Fmt::M4a` → `"m4a"`.
    pub fn as_str(self) -> &'static str {
        match self {
            Fmt::Jpg => "jpg", Fmt::Png => "png", Fmt::Webp => "webp", Fmt::Heic => "heic", Fmt::Tiff => "tiff",
            Fmt::Svg => "svg", Fmt::Avif => "avif", Fmt::Bmp => "bmp", Fmt::Mp3 => "mp3", Fmt::M4a => "m4a",
            Fmt::Wav => "wav", Fmt::Flac => "flac", Fmt::Ogg => "ogg", Fmt::Opus => "opus", Fmt::Aiff => "aiff",
            Fmt::Wma => "wma", Fmt::Mp4 => "mp4", Fmt::Mov => "mov", Fmt::Mkv => "mkv", Fmt::Webm => "webm",
            Fmt::Avi => "avi", Fmt::Wmv => "wmv", Fmt::Gif => "gif", Fmt::Pdf => "pdf", Fmt::Docx => "docx",
            Fmt::Epub => "epub", Fmt::Txt => "txt", Fmt::Srt => "srt", Fmt::Vtt => "vtt",
        }
    }

    pub fn parse(s: &str) -> Option<Fmt> {
        Fmt::ALL.iter().copied().find(|f| f.as_str() == s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WheelMode {
    Convert,
    Tools,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolId {
    #[serde(rename = "video.compress")] VideoCompress,
    #[serde(rename = "video.metadata")] VideoMetadata,
    #[serde(rename = "video.mute")] VideoMute,
    #[serde(rename = "video.trim")] VideoTrim,
    #[serde(rename = "video.crop")] VideoCrop,
    #[serde(rename = "video.speed")] VideoSpeed,
    #[serde(rename = "video.snapshot")] VideoSnapshot,
    #[serde(rename = "video.split")] VideoSplit,
    #[serde(rename = "video.redact")] VideoRedact,
    #[serde(rename = "video.join")] VideoJoin,
    #[serde(rename = "audio.compress")] AudioCompress,
    #[serde(rename = "audio.normalize")] AudioNormalize,
    #[serde(rename = "audio.trim")] AudioTrim,
    #[serde(rename = "audio.channels")] AudioChannels,
    #[serde(rename = "audio.visualize")] AudioVisualize,
    #[serde(rename = "audio.bleep")] AudioBleep,
    #[serde(rename = "audio.metadata")] AudioMetadata,
    #[serde(rename = "audio.join")] AudioJoin,
    #[serde(rename = "image.compress")] ImageCompress,
    #[serde(rename = "image.resize")] ImageResize,
    #[serde(rename = "image.crop")] ImageCrop,
    #[serde(rename = "image.edit")] ImageEdit,
    #[serde(rename = "image.background")] ImageBackground,
    #[serde(rename = "image.redact")] ImageRedact,
    #[serde(rename = "image.metadata")] ImageMetadata,
    #[serde(rename = "image.collage")] ImageCollage,
    #[serde(rename = "image.pdf")] ImagePdf,
    #[serde(rename = "pdf.compress")] PdfCompress,
    #[serde(rename = "pdf.merge")] PdfMerge,
    #[serde(rename = "pdf.split")] PdfSplit,
    #[serde(rename = "pdf.organize")] PdfOrganize,
    #[serde(rename = "pdf.images")] PdfImages,
    #[serde(rename = "pdf.ocr")] PdfOcr,
    #[serde(rename = "pdf.word")] PdfWord,
    #[serde(rename = "pdf.metadata")] PdfMetadata,
    #[serde(rename = "subtitle.shift")] SubtitleShift,
}

impl ToolId {
    /// The id used in JSON and in the registry, e.g. `"video.compress"`.
    pub fn as_str(self) -> String {
        match serde_json::to_value(self) {
            Ok(Value::String(s)) => s,
            _ => unreachable!("ToolId always serializes to a string"),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub base: String,
    pub ext: String,
    pub fmt: Option<Fmt>,
    pub category: Option<Category>,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deep: Option<bool>,
    /// DISPLAY width (after rotation / EXIF orientation).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pages: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_video: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_audio: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_cover: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_codec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_codec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    /// data: URL, longest side <= 256 px.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// "win32" | "darwin" | "linux" (the same strings as Node's process.platform).
    pub platform: String,
    /// "x64" | "arm64".
    pub arch: String,
    pub app_version: String,
    pub ffmpeg: bool,
    pub ffmpeg_version: String,
    pub encoders: Vec<String>,
    /// true = HEIC OUTPUT is possible (via heic_tool).
    pub heif_enc: bool,
    /// "sips" | "heif-enc" | null.
    pub heic_tool: Option<String>,
    /// A verified hardware H.264 encoder, e.g. "h264_videotoolbox".
    pub hw_video: Option<String>,
    /// "mac-helper" | "hook" | "unavailable".
    pub global_drag: String,
    pub ocr_languages: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// "same-folder" | "custom-folder".
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    /// "system" | "light" | "dark".
    pub theme: String,
    pub high_contrast_accent: bool,
    pub image_quality: f64,
    pub video_crf: f64,
    pub audio_bitrate_kbps: f64,
    pub pdf_dpi: f64,
    pub ocr_languages: Vec<String>,
    pub max_concurrent_jobs: f64,
    pub hardware_video: bool,
    pub notify_when_done: bool,
    pub reveal_when_done: bool,
    pub global_drag_wheel: bool,
    pub send_to_menu: bool,
    pub context_menu: bool,
    pub launch_at_login: bool,
    pub close_to_tray: bool,
    pub show_in_dock: bool,
    pub sounds: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    Error,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum JobRequest {
    Convert {
        inputs: Vec<String>,
        target: Fmt,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        options: Option<ConvertOptions>,
    },
    Tool {
        inputs: Vec<String>,
        #[serde(rename = "toolId")]
        tool_id: ToolId,
        #[serde(default)]
        options: Value,
    },
}

impl JobRequest {
    pub fn inputs(&self) -> &[String] {
        match self {
            JobRequest::Convert { inputs, .. } => inputs,
            JobRequest::Tool { inputs, .. } => inputs,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobUpdate {
    pub id: String,
    /// "Convert to MP4" / "Compress".
    pub label: String,
    pub request: JobRequest,
    pub status: JobStatus,
    /// 0..1 overall.
    pub progress: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub outputs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,
    /// Milliseconds since 1970 (JavaScript Date.now()).
    pub created_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInit {
    pub files: Vec<FileInfo>,
    pub mode: WheelMode,
    pub caps: Capabilities,
    /// "window" | "argv" | "drag".
    pub source: String,
}

/// Global drag. `files` is filled once the dragged files are known.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragState {
    pub active: bool,
    pub mode: WheelMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileInfo>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataField {
    pub key: String,
    pub label: String,
    pub value: String,
    pub editable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataInfo {
    /// "media" | "image" | "pdf".
    pub kind: String,
    pub fields: Vec<MetadataField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_gps: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_cover: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_data_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreviewRequest {
    /// "none" | "edit" | "background" | "compress" | "collage" | "crop".
    pub op: String,
    pub path: String,
    #[serde(default)]
    pub paths: Option<Vec<String>>,
    pub max_side: f64,
    #[serde(default)]
    pub options: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreviewResult {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Port of src/shared/overlay.ts `OverlaySize`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlaySize {
    pub width: f64,
    pub height: f64,
    /// "wheel" | "center".
    pub anchor: String,
}

/// src/shared/overlay.ts `WHEEL_STAGE`: the wheel centre (anchor_x, anchor_y) is placed at the cursor.
pub const WHEEL_STAGE_WIDTH: f64 = 440.0;
pub const WHEEL_STAGE_HEIGHT: f64 = 500.0;
pub const WHEEL_STAGE_ANCHOR_X: f64 = 220.0;
pub const WHEEL_STAGE_ANCHOR_Y: f64 = 210.0;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn job_request_round_trips_the_ui_shape() {
        let convert: JobRequest = serde_json::from_value(json!({ "kind": "convert", "inputs": ["/a.png"], "target": "jpg" })).unwrap();
        assert!(matches!(convert, JobRequest::Convert { target: Fmt::Jpg, .. }));
        let tool: JobRequest = serde_json::from_value(json!({
            "kind": "tool", "inputs": ["/a.mp4"], "toolId": "video.trim", "options": { "startSec": 1 }
        })).unwrap();
        assert_eq!(serde_json::to_value(&tool).unwrap()["toolId"], "video.trim");
        assert_eq!(ToolId::SubtitleShift.as_str(), "subtitle.shift");
    }

    #[test]
    fn file_info_skips_missing_fields_and_keeps_null_fmt() {
        let f = FileInfo { path: "/x.zip".into(), name: "x.zip".into(), base: "x".into(), ext: "zip".into(), ..Default::default() };
        let v = serde_json::to_value(&f).unwrap();
        assert_eq!(v["fmt"], Value::Null);
        assert!(v.get("width").is_none());
        assert_eq!(Fmt::parse("m4a"), Some(Fmt::M4a));
        assert_eq!(serde_json::to_value(Fmt::M4a).unwrap(), "m4a");
    }
}
