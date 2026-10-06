import type { NormRect } from './geometry';
import type { ToolId } from './types';

// ---------- Convert options (Step-2 cards for conversions) ----------
export interface ConvertOptions {
  quality?: number;                                     // images 1..100
  svgMode?: 'trace' | 'embed';
  svgColors?: number;                                   // 2..32
  gifWidth?: number;                                    // 0 = original
  gifFps?: number;
  docMode?: 'reflow' | 'pages';                         // PDF→DOCX/EPUB, EPUB→PDF
  ocr?: 'auto' | 'off';
  textSize?: 'small' | 'medium' | 'large' | 'xlarge';
  font?: 'original' | 'serif' | 'sans' | 'mono';
  pageSize?: 'a4' | 'letter' | 'a5';
  imageDpi?: number;                                    // TXT → JPG/PNG
  cueTiming?: 'reading' | 'fixed';
  secondsPerCue?: number;
}

export const DEFAULT_CONVERT_OPTIONS: Required<ConvertOptions> = {
  quality: 85, svgMode: 'trace', svgColors: 16, gifWidth: 480, gifFps: 12, docMode: 'reflow', ocr: 'auto',
  textSize: 'medium', font: 'original', pageSize: 'a4', imageDpi: 150, cueTiming: 'reading', secondsPerCue: 3
};

// ---------- Tool options ----------
export interface TimeRangeSec { startSec: number; endSec: number }

export interface VideoCompressOptions { preset: 'high' | 'balanced' | 'small'; maxHeight: 0 | 2160 | 1080 | 720 | 480; codec: 'h264' | 'h265'; targetSizeMb: number }
export interface VideoTrimOptions { startSec: number; endSec: number; precise: boolean }   // endSec 0 = end of file
export interface VideoSplitOptions { mode: 'at' | 'parts' | 'every'; times: number[]; parts: number; everySec: number; precise: boolean }
export interface VideoCropOptions { rect: NormRect }
export interface VideoSpeedOptions { factor: number; keepAudio: boolean }
export interface VideoSnapshotOptions { mode: 'single' | 'every'; timeSec: number; everySec: number; format: 'png' | 'jpg' }
export interface RedactRegion { rect: NormRect; style: 'blur' | 'pixelate' | 'black'; startSec?: number; endSec?: number }
export interface VideoRedactOptions { regions: RedactRegion[] }
export interface MediaMetadataOptions { removeAll: boolean; tags: Record<string, string>; coverPath: string | null; removeCover: boolean }
export interface JoinOptions { order: string[] }                                         // empty = input order
export interface AudioCompressOptions { bitrateKbps: number; format: 'keep' | 'mp3' | 'm4a' | 'opus'; mono: boolean }
export interface AudioNormalizeOptions { target: number; truePeak: number }               // LUFS, dBTP
export interface AudioTrimOptions { startSec: number; endSec: number; fadeInSec: number; fadeOutSec: number }
export interface AudioChannelsOptions { mode: 'mono' | 'stereo' | 'left' | 'right' | 'swap' }
export interface AudioVisualizeOptions { kind: 'waveform-png' | 'spectrogram-png' | 'waveform-mp4'; width: number; height: number; color: string; background: string }
export interface AudioBleepOptions { ranges: TimeRangeSec[]; sound: 'beep' | 'silence'; frequency: number }
export interface ImageCompressOptions { quality: number; maxSide: number; format: 'keep' | 'jpg' | 'webp' | 'avif'; stripMetadata: boolean }
export interface ImageResizeOptions { mode: 'percent' | 'pixels'; percent: number; width: number; height: number; keepAspect: boolean }
export interface ImageCropOptions { rect: NormRect; rotate: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean }
export interface EditParams {
  exposure: number;   // -2..2 EV
  brightness: number; // -100..100
  contrast: number;   // -100..100
  saturation: number; // -100..100
  warmth: number;     // -100..100
  hue: number;        // -180..180
  detail: number;     // 0..100 (sharpen)
  blur: number;       // 0..100
  vignette: number;   // 0..100
  effect: 'none' | 'bw' | 'sepia' | 'vintage' | 'invert';
}
export interface ImageBackgroundOptions {
  kind: 'solid' | 'gradient' | 'blur'; color: string; gradient: [string, string]; angle: number;
  paddingPct: number; radiusPct: number; shadow: boolean; aspect: 'auto' | '1:1' | '4:5' | '16:9' | '9:16';
}
export interface ImageRedactOptions { regions: Array<{ rect: NormRect; style: 'blur' | 'pixelate' | 'black' }> }
export interface ImageMetadataOptions {
  action: 'remove-all' | 'remove-gps' | 'edit';
  fields: { artist?: string; copyright?: string; description?: string; dateTaken?: string };
}
export interface CollageOptions {
  layout: 'grid' | 'row' | 'column' | 'featured'; order: string[]; gap: number; background: string;
  radius: number; width: number; fit: 'cover' | 'contain';
}
export interface CreatePdfOptions { order: string[]; pageSize: 'fit' | 'a4' | 'letter'; margin: 'none' | 'small' | 'large'; combine: boolean }
export interface PdfCompressOptions { level: 'light' | 'balanced' | 'strong' | 'max' }
export interface PdfMergeOptions { order: string[] }
export interface PdfSplitOptions { mode: 'each' | 'every' | 'ranges' | 'extract'; every: number; ranges: string }
export interface PdfOrganizeOptions { pages: Array<{ src: number; rotate: 0 | 90 | 180 | 270 }> } // final order; src = 0-based
export interface PdfImagesOptions { format: 'png' | 'jpg'; dpi: number; ranges: string; quality: number }
export interface PdfOcrOptions { languages: string[]; output: 'txt' | 'pdf'; ranges: string }
export interface PdfWordOptions { mode: 'reflow' | 'pages'; ocr: 'auto' | 'off' }
export interface PdfMetadataOptions { removeAll: boolean; title: string; author: string; subject: string; keywords: string }
export interface SubtitleShiftOptions { offsetMs: number }

export const DEFAULT_EDIT: EditParams = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0, detail: 0, blur: 0, vignette: 0, effect: 'none'
};

const FULL: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export const TOOL_DEFAULTS = {
  'video.compress': { preset: 'balanced', maxHeight: 0, codec: 'h264', targetSizeMb: 0 } as VideoCompressOptions,
  'video.metadata': { removeAll: false, tags: {}, coverPath: null, removeCover: false } as MediaMetadataOptions,
  'video.mute': {},
  'video.trim': { startSec: 0, endSec: 0, precise: false } as VideoTrimOptions,
  'video.crop': { rect: FULL } as VideoCropOptions,
  'video.speed': { factor: 2, keepAudio: true } as VideoSpeedOptions,
  'video.snapshot': { mode: 'single', timeSec: 0, everySec: 5, format: 'png' } as VideoSnapshotOptions,
  'video.split': { mode: 'parts', times: [], parts: 2, everySec: 60, precise: false } as VideoSplitOptions,
  'video.redact': { regions: [] } as VideoRedactOptions,
  'video.join': { order: [] } as JoinOptions,
  'audio.compress': { bitrateKbps: 128, format: 'keep', mono: false } as AudioCompressOptions,
  'audio.normalize': { target: -16, truePeak: -1.5 } as AudioNormalizeOptions,
  'audio.trim': { startSec: 0, endSec: 0, fadeInSec: 0, fadeOutSec: 0 } as AudioTrimOptions,
  'audio.channels': { mode: 'mono' } as AudioChannelsOptions,
  'audio.visualize': { kind: 'waveform-png', width: 1920, height: 480, color: '#FF5A1F', background: '#FFFFFF' } as AudioVisualizeOptions,
  'audio.bleep': { ranges: [], sound: 'beep', frequency: 1000 } as AudioBleepOptions,
  'audio.metadata': { removeAll: false, tags: {}, coverPath: null, removeCover: false } as MediaMetadataOptions,
  'audio.join': { order: [] } as JoinOptions,
  'image.compress': { quality: 75, maxSide: 0, format: 'keep', stripMetadata: true } as ImageCompressOptions,
  'image.resize': { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true } as ImageResizeOptions,
  'image.crop': { rect: FULL, rotate: 0, flipH: false, flipV: false } as ImageCropOptions,
  'image.edit': { ...DEFAULT_EDIT } as EditParams,
  'image.background': {
    kind: 'gradient', color: '#F3F3F2', gradient: ['#FFB38A', '#FF5A1F'], angle: 135,
    paddingPct: 8, radiusPct: 3, shadow: true, aspect: 'auto'
  } as ImageBackgroundOptions,
  'image.redact': { regions: [] } as ImageRedactOptions,
  'image.metadata': { action: 'remove-all', fields: {} } as ImageMetadataOptions,
  'image.collage': { layout: 'grid', order: [], gap: 12, background: '#FFFFFF', radius: 8, width: 2048, fit: 'cover' } as CollageOptions,
  'image.pdf': { order: [], pageSize: 'a4', margin: 'small', combine: true } as CreatePdfOptions,
  'pdf.compress': { level: 'balanced' } as PdfCompressOptions,
  'pdf.merge': { order: [] } as PdfMergeOptions,
  'pdf.split': { mode: 'each', every: 1, ranges: '' } as PdfSplitOptions,
  'pdf.organize': { pages: [] } as PdfOrganizeOptions,
  'pdf.images': { format: 'png', dpi: 300, ranges: '', quality: 90 } as PdfImagesOptions,
  'pdf.ocr': { languages: ['eng'], output: 'txt', ranges: '' } as PdfOcrOptions,
  'pdf.word': { mode: 'reflow', ocr: 'auto' } as PdfWordOptions,
  'pdf.metadata': { removeAll: false, title: '', author: '', subject: '', keywords: '' } as PdfMetadataOptions,
  'subtitle.shift': { offsetMs: 0 } as SubtitleShiftOptions
} satisfies Record<ToolId, object>;

/** Merge user options over defaults (shallow). Use in every tool runner. */
export function withDefaults<T extends object>(toolId: ToolId, options: Record<string, unknown> | undefined): T {
  return { ...(TOOL_DEFAULTS[toolId] as object), ...(options ?? {}) } as T;
}
