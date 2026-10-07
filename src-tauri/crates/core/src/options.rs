//! Port of src/shared/toolOptions.ts. Defaults live in src/shared/registry/defaults.json (see `registry`).
//! Every number is f64 because the UI sends JavaScript numbers.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::geometry::NormRect;
use crate::registry;
use crate::types::ToolId;

// ---------- Convert options (Step-2 cards for conversions) ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SvgMode { Trace, Embed }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocMode { Reflow, Pages }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrMode { Auto, Off }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextSize { Small, Medium, Large, Xlarge }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextFont { Original, Serif, Sans, Mono }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageSize { A4, Letter, A5 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CueTiming { Reading, Fixed }

/// All fields optional: a missing field means "use DEFAULT_CONVERT_OPTIONS" (defaults.json → "convert").
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")] pub quality: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub svg_mode: Option<SvgMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub svg_colors: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub gif_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub gif_fps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub doc_mode: Option<DocMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub ocr: Option<OcrMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub text_size: Option<TextSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub font: Option<TextFont>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub page_size: Option<PageSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub image_dpi: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub cue_timing: Option<CueTiming>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub seconds_per_cue: Option<f64>,
}

/// DEFAULT_CONVERT_OPTIONS with every field present.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertDefaults {
    pub quality: f64,
    pub svg_mode: SvgMode,
    pub svg_colors: f64,
    pub gif_width: f64,
    pub gif_fps: f64,
    pub doc_mode: DocMode,
    pub ocr: OcrMode,
    pub text_size: TextSize,
    pub font: TextFont,
    pub page_size: PageSize,
    pub image_dpi: f64,
    pub cue_timing: CueTiming,
    pub seconds_per_cue: f64,
}

// ---------- Tool options ----------

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRangeSec { pub start_sec: f64, pub end_sec: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressPreset { High, Balanced, Small }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec { H264, H265 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCompressOptions { pub preset: CompressPreset, pub max_height: f64, pub codec: VideoCodec, pub target_size_mb: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrimOptions { pub start_sec: f64, pub end_sec: f64, pub precise: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitMode { At, Parts, Every }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSplitOptions { pub mode: SplitMode, pub times: Vec<f64>, pub parts: f64, pub every_sec: f64, pub precise: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCropOptions { pub rect: NormRect }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSpeedOptions { pub factor: f64, pub keep_audio: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotMode { Single, Every }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StillFormat { Png, Jpg }

impl StillFormat {
    pub fn ext(self) -> &'static str {
        match self { StillFormat::Png => "png", StillFormat::Jpg => "jpg" }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSnapshotOptions { pub mode: SnapshotMode, pub time_sec: f64, pub every_sec: f64, pub format: StillFormat }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedactStyle { Blur, Pixelate, Black }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactRegion {
    pub rect: NormRect,
    pub style: RedactStyle,
    #[serde(default)] pub start_sec: Option<f64>,
    #[serde(default)] pub end_sec: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoRedactOptions { pub regions: Vec<RedactRegion> }

/// `tags` keeps the UI's key order (serde_json "preserve_order" feature).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadataOptions {
    pub remove_all: bool,
    pub tags: serde_json::Map<String, Value>,
    pub cover_path: Option<String>,
    pub remove_cover: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinOptions { pub order: Vec<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCompressFormat { Keep, Mp3, M4a, Opus }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCompressOptions { pub bitrate_kbps: f64, pub format: AudioCompressFormat, pub mono: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioNormalizeOptions { pub target: f64, pub true_peak: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrimOptions { pub start_sec: f64, pub end_sec: f64, pub fade_in_sec: f64, pub fade_out_sec: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelMode { Mono, Stereo, Left, Right, Swap }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChannelsOptions { pub mode: ChannelMode }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VisualizeKind {
    #[serde(rename = "waveform-png")] WaveformPng,
    #[serde(rename = "spectrogram-png")] SpectrogramPng,
    #[serde(rename = "waveform-mp4")] WaveformMp4,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioVisualizeOptions { pub kind: VisualizeKind, pub width: f64, pub height: f64, pub color: String, pub background: String }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BleepSound { Beep, Silence }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioBleepOptions { pub ranges: Vec<TimeRangeSec>, pub sound: BleepSound, pub frequency: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageCompressFormat { Keep, Jpg, Webp, Avif }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressOptions { pub quality: f64, pub max_side: f64, pub format: ImageCompressFormat, pub strip_metadata: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResizeMode { Percent, Pixels }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResizeOptions { pub mode: ResizeMode, pub percent: f64, pub width: f64, pub height: f64, pub keep_aspect: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCropOptions { pub rect: NormRect, pub rotate: f64, pub flip_h: bool, pub flip_v: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EditEffect { None, Bw, Sepia, Vintage, Invert }

/// `EditParams` in TypeScript.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditParams {
    pub exposure: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub warmth: f64,
    pub hue: f64,
    pub detail: f64,
    pub blur: f64,
    pub vignette: f64,
    pub effect: EditEffect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackgroundKind { Solid, Gradient, Blur }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageBackgroundOptions {
    pub kind: BackgroundKind,
    pub color: String,
    pub gradient: (String, String),
    pub angle: f64,
    pub padding_pct: f64,
    pub radius_pct: f64,
    pub shadow: bool,
    /// "auto" | "1:1" | "4:5" | "16:9" | "9:16".
    pub aspect: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRedactRegion { pub rect: NormRect, pub style: RedactStyle }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRedactOptions { pub regions: Vec<ImageRedactRegion> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageMetadataAction {
    #[serde(rename = "remove-all")] RemoveAll,
    #[serde(rename = "remove-gps")] RemoveGps,
    #[serde(rename = "edit")] Edit,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataFields {
    #[serde(default)] pub artist: Option<String>,
    #[serde(default)] pub copyright: Option<String>,
    #[serde(default)] pub description: Option<String>,
    #[serde(default)] pub date_taken: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataOptions { pub action: ImageMetadataAction, pub fields: ImageMetadataFields }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollageLayoutKind { Grid, Row, Column, Featured }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollageFit { Cover, Contain }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollageOptions {
    pub layout: CollageLayoutKind,
    pub order: Vec<String>,
    pub gap: f64,
    pub background: String,
    pub radius: f64,
    pub width: f64,
    pub fit: CollageFit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfPageSize { Fit, A4, Letter }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfMargin { None, Small, Large }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePdfOptions { pub order: Vec<String>, pub page_size: PdfPageSize, pub margin: PdfMargin, pub combine: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfCompressLevel { Light, Balanced, Strong, Max }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCompressOptions { pub level: PdfCompressLevel }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMergeOptions { pub order: Vec<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfSplitMode { Each, Every, Ranges, Extract }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSplitOptions { pub mode: PdfSplitMode, pub every: f64, pub ranges: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOrganizePage { pub src: f64, pub rotate: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOrganizeOptions { pub pages: Vec<PdfOrganizePage> }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfImagesOptions { pub format: StillFormat, pub dpi: f64, pub ranges: String, pub quality: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrOutput { Txt, Pdf }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrOptions { pub languages: Vec<String>, pub output: OcrOutput, pub ranges: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfWordOptions { pub mode: DocMode, pub ocr: OcrMode }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadataOptions { pub remove_all: bool, pub title: String, pub author: String, pub subject: String, pub keywords: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleShiftOptions { pub offset_ms: f64 }

/// Port of `withDefaults`: shallow merge of the UI's options over defaults.json["tools"][toolId].
/// Lenient per key: a key with the wrong type is ignored (the default is kept) instead of failing the job.
pub fn with_defaults<T: DeserializeOwned>(tool: ToolId, options: &Value) -> T {
    let mut merged = registry::tool_defaults(tool).clone();
    if let (Value::Object(target), Value::Object(user)) = (&mut merged, options) {
        for (key, value) in user {
            let mut trial = target.clone();
            trial.insert(key.clone(), value.clone());
            if serde_json::from_value::<T>(Value::Object(trial)).is_ok() {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    serde_json::from_value(merged)
        .unwrap_or_else(|e| panic!("defaults.json does not match the options of {}: {e}", tool.as_str()))
}

/// Defaults for `image.edit` (DEFAULT_EDIT).
pub fn default_edit() -> EditParams {
    serde_json::from_value(registry::get().defaults["edit"].clone()).expect("defaults.json edit")
}

/// DEFAULT_CONVERT_OPTIONS.
pub fn convert_defaults() -> ConvertDefaults {
    serde_json::from_value(registry::get().defaults["convert"].clone()).expect("defaults.json convert")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merges_over_defaults() {
        let o: VideoCompressOptions = with_defaults(ToolId::VideoCompress, &json!({ "preset": "small" }));
        assert_eq!(o.preset, CompressPreset::Small);
        assert_eq!(o.codec, VideoCodec::H264);
    }

    #[test]
    fn wrong_types_fall_back_to_the_default() {
        let o: VideoTrimOptions = with_defaults(ToolId::VideoTrim, &json!({ "startSec": "oops", "endSec": 3, "unknown": 1 }));
        assert_eq!(o.start_sec, 0.0);
        assert_eq!(o.end_sec, 3.0);
    }

    #[test]
    fn every_tool_has_parseable_defaults() {
        use crate::types::ToolId::*;
        let empty = json!({});
        let _: VideoCompressOptions = with_defaults(VideoCompress, &empty);
        let _: MediaMetadataOptions = with_defaults(VideoMetadata, &empty);
        let _: VideoTrimOptions = with_defaults(VideoTrim, &empty);
        let _: VideoCropOptions = with_defaults(VideoCrop, &empty);
        let _: VideoSpeedOptions = with_defaults(VideoSpeed, &empty);
        let _: VideoSnapshotOptions = with_defaults(VideoSnapshot, &empty);
        let _: VideoSplitOptions = with_defaults(VideoSplit, &empty);
        let _: VideoRedactOptions = with_defaults(VideoRedact, &empty);
        let _: JoinOptions = with_defaults(VideoJoin, &empty);
        let _: AudioCompressOptions = with_defaults(AudioCompress, &empty);
        let _: AudioNormalizeOptions = with_defaults(AudioNormalize, &empty);
        let _: AudioTrimOptions = with_defaults(AudioTrim, &empty);
        let _: AudioChannelsOptions = with_defaults(AudioChannels, &empty);
        let _: AudioVisualizeOptions = with_defaults(AudioVisualize, &empty);
        let _: AudioBleepOptions = with_defaults(AudioBleep, &empty);
        let _: MediaMetadataOptions = with_defaults(AudioMetadata, &empty);
        let _: JoinOptions = with_defaults(AudioJoin, &empty);
        let _: ImageCompressOptions = with_defaults(ImageCompress, &empty);
        let _: ImageResizeOptions = with_defaults(ImageResize, &empty);
        let _: ImageCropOptions = with_defaults(ImageCrop, &empty);
        let _: EditParams = with_defaults(ImageEdit, &empty);
        let _: ImageBackgroundOptions = with_defaults(ImageBackground, &empty);
        let _: ImageRedactOptions = with_defaults(ImageRedact, &empty);
        let _: ImageMetadataOptions = with_defaults(ImageMetadata, &empty);
        let _: CollageOptions = with_defaults(ImageCollage, &empty);
        let _: CreatePdfOptions = with_defaults(ImagePdf, &empty);
        let _: PdfCompressOptions = with_defaults(PdfCompress, &empty);
        let _: PdfMergeOptions = with_defaults(PdfMerge, &empty);
        let _: PdfSplitOptions = with_defaults(PdfSplit, &empty);
        let _: PdfOrganizeOptions = with_defaults(PdfOrganize, &empty);
        let _: PdfImagesOptions = with_defaults(PdfImages, &empty);
        let _: PdfOcrOptions = with_defaults(PdfOcr, &empty);
        let _: PdfWordOptions = with_defaults(PdfWord, &empty);
        let _: PdfMetadataOptions = with_defaults(PdfMetadata, &empty);
        let _: SubtitleShiftOptions = with_defaults(SubtitleShift, &empty);
        let _ = default_edit();
        let _ = convert_defaults();
    }
}
