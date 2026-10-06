import type { ConvertOptions } from './toolOptions';

export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'text' | 'subtitle';

export type Fmt =
  | 'jpg' | 'png' | 'webp' | 'heic' | 'tiff' | 'svg' | 'avif' | 'bmp'
  | 'mp3' | 'm4a' | 'wav' | 'flac' | 'ogg' | 'opus' | 'aiff' | 'wma'
  | 'mp4' | 'mov' | 'mkv' | 'webm' | 'avi' | 'wmv' | 'gif'
  | 'pdf' | 'docx' | 'epub' | 'txt' | 'srt' | 'vtt';

export type WheelMode = 'convert' | 'tools';

export type ToolId =
  | 'video.compress' | 'video.metadata' | 'video.mute' | 'video.trim' | 'video.crop'
  | 'video.speed' | 'video.snapshot' | 'video.split' | 'video.redact' | 'video.join'
  | 'audio.compress' | 'audio.normalize' | 'audio.trim' | 'audio.channels' | 'audio.visualize'
  | 'audio.bleep' | 'audio.metadata' | 'audio.join'
  | 'image.compress' | 'image.resize' | 'image.crop' | 'image.edit' | 'image.background'
  | 'image.redact' | 'image.metadata' | 'image.collage' | 'image.pdf'
  | 'pdf.compress' | 'pdf.merge' | 'pdf.split' | 'pdf.organize' | 'pdf.images' | 'pdf.ocr'
  | 'pdf.word' | 'pdf.metadata'
  | 'subtitle.shift';

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

export interface FileInfo {
  path: string;
  name: string;            // "geese.mp4"
  base: string;            // "geese"
  ext: string;             // "mp4" (lower-case, no dot)
  fmt: Fmt | null;         // null = unsupported input
  category: Category | null;
  size: number;            // bytes
  deep?: boolean;          // true once deep inspection finished
  width?: number;          // DISPLAY width (after rotation / EXIF orientation)
  height?: number;
  durationSec?: number;
  pages?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasCover?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  thumbnail?: string;      // data URL, longest side <= 256 px
  error?: string;
}

export type Platform = 'win32' | 'darwin' | 'linux';

export interface Capabilities {
  platform: Platform;
  arch: string;                  // 'x64' | 'arm64'
  appVersion: string;
  ffmpeg: boolean;
  ffmpegVersion: string;
  encoders: string[];
  heifEnc: boolean;              // true = HEIC OUTPUT is possible (via heicTool)
  heicTool: 'sips' | 'heif-enc' | null;   // macOS: sips (built in); Windows/Linux: heif-enc if present
  hwVideo: string | null;        // verified hardware H.264 encoder, e.g. 'h264_videotoolbox' (Task 12.7; null until then)
  globalDrag: 'mac-helper' | 'hook' | 'unavailable';   // how the global drag wheel works on this OS/session
  ocrLanguages: string[];
}

export interface Settings {
  outputMode: 'same-folder' | 'custom-folder';
  customOutputDir: string | null;
  theme: 'system' | 'light' | 'dark';
  highContrastAccent: boolean;
  imageQuality: number;      // 1..100
  videoCrf: number;          // 18..32 (H.264 CRF)
  audioBitrateKbps: number;  // AAC/WMA/Opus bitrate
  pdfDpi: number;            // PDF → image DPI
  ocrLanguages: string[];    // e.g. ['eng'] or ['eng','vie']
  maxConcurrentJobs: number;
  hardwareVideo: boolean;    // use caps.hwVideo when available (Task 12.7)
  notifyWhenDone: boolean;
  revealWhenDone: boolean;
  globalDragWheel: boolean;
  sendToMenu: boolean;       // Windows only: Explorer "Send to"
  contextMenu: boolean;      // Windows: right-click verb · Linux: Nautilus script + Dolphin service menu
  launchAtLogin: boolean;
  closeToTray: boolean;      // Windows/Linux tray · macOS menu bar
  showInDock: boolean;       // macOS only
}

export const DEFAULT_SETTINGS: Settings = {
  outputMode: 'same-folder',
  customOutputDir: null,
  theme: 'system',
  highContrastAccent: false,
  imageQuality: 85,
  videoCrf: 23,
  audioBitrateKbps: 192,
  pdfDpi: 300,
  ocrLanguages: ['eng'],
  maxConcurrentJobs: 2,
  hardwareVideo: true,
  notifyWhenDone: true,
  revealWhenDone: false,
  globalDragWheel: false,
  sendToMenu: false,
  contextMenu: false,
  launchAtLogin: false,
  closeToTray: true,
  showInDock: true
};

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

export type JobRequest =
  | { kind: 'convert'; inputs: string[]; target: Fmt; options?: ConvertOptions }
  | { kind: 'tool'; inputs: string[]; toolId: ToolId; options: Record<string, unknown> };

export interface JobUpdate {
  id: string;
  label: string;             // "Convert to MP4" / "Compress"
  request: JobRequest;
  status: JobStatus;
  progress: number;          // 0..1 overall
  detail?: string;           // "geese.mov · 2 of 5"
  outputs: string[];         // absolute final paths (status 'done')
  note?: string;             // "Saved 42 % (12.3 MB → 7.1 MB)"
  outputBytes?: number;      // total size of the outputs (status 'done')
  error?: string;            // user-facing message
  errorDetails?: string;     // technical text
  createdAt: number;
  finishedAt?: number;
}

export interface OverlayInit {
  files: FileInfo[];
  mode: WheelMode;
  caps: Capabilities;
  source: 'window' | 'argv' | 'drag';
}

/** Global drag. `files` is filled only on macOS, where the Swift helper can read the dragged files before the drop. */
export interface DragState { active: boolean; mode: WheelMode; files?: FileInfo[] }

export interface MetadataField { key: string; label: string; value: string; editable: boolean }

export interface MetadataInfo {
  kind: 'media' | 'image' | 'pdf';
  fields: MetadataField[];
  hasGps?: boolean;
  hasCover?: boolean;
  coverDataUrl?: string;
}

export interface ImagePreviewRequest {
  op: 'none' | 'edit' | 'background' | 'compress' | 'collage' | 'crop';
  path: string;              // main image (collage: ignored, uses `paths`)
  paths?: string[];
  maxSide: number;           // preview size, e.g. 1200
  options?: Record<string, unknown>;
}

export interface ImagePreviewResult {
  dataUrl: string;
  width: number;
  height: number;
  bytes?: number;            // compress: estimated output size (full resolution)
  originalBytes?: number;
}
