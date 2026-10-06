import type { OverlaySize } from './overlay';
import type {
  Capabilities, DragState, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate,
  MetadataInfo, OverlayInit, Settings, WheelMode
} from './types';

export const IPC = {
  getCapabilities: 'app:get-capabilities',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  pickFiles: 'files:pick',
  pickFolder: 'files:pick-folder',
  inspectFiles: 'files:inspect',
  startJob: 'job:start',
  cancelJob: 'job:cancel',
  listJobs: 'job:list',
  reveal: 'shell:reveal',
  openPath: 'shell:open',
  openNotices: 'shell:open-notices',
  openOverlay: 'overlay:open',
  closeOverlay: 'overlay:close',
  resizeOverlay: 'overlay:resize',
  overlayDropped: 'overlay:dropped',
  previewMedia: 'preview:media',
  previewFrame: 'preview:frame',
  previewWaveform: 'preview:waveform',
  previewImage: 'preview:image',
  pdfThumbnails: 'preview:pdf-thumbnails',
  readMetadata: 'meta:read',
  evJobUpdate: 'ev:job-update',
  evOverlayInit: 'ev:overlay-init',
  evOverlayFiles: 'ev:overlay-files',
  evOverlayDrag: 'ev:overlay-drag',
  evSettings: 'ev:settings',
  evNavigate: 'ev:navigate',          // main → main window: switch tab (macOS ⌘, opens Settings)
  engineCall: 'engine:call',
  engineResult: 'engine:result',
  engineReady: 'engine:ready'
} as const;

export interface KabooksApi {
  getPathForFile(file: File): string;
  getCapabilities(): Promise<Capabilities>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFiles(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  inspectFiles(paths: string[], deep: boolean): Promise<FileInfo[]>;
  startJob(req: JobRequest): Promise<string>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<JobUpdate[]>;
  reveal(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  openNotices(): Promise<void>;
  openOverlay(paths: string[], mode: WheelMode): Promise<void>;
  closeOverlay(): Promise<void>;
  resizeOverlay(size: OverlaySize): Promise<void>;
  overlayDropped(paths: string[]): Promise<FileInfo[]>;
  previewMedia(path: string): Promise<{ url: string; isProxy: boolean }>;
  previewFrame(path: string, timeSec: number, maxWidth: number): Promise<string>;
  previewWaveform(path: string, width: number, height: number): Promise<string>;
  previewImage(req: ImagePreviewRequest): Promise<ImagePreviewResult>;
  pdfThumbnails(path: string, maxWidth: number): Promise<string[]>;
  readMetadata(path: string): Promise<MetadataInfo>;
  onJobUpdate(cb: (u: JobUpdate) => void): () => void;
  onOverlayInit(cb: (p: OverlayInit) => void): () => void;
  onOverlayFiles(cb: (files: FileInfo[]) => void): () => void;
  onOverlayDrag(cb: (s: DragState) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onNavigate(cb: (tab: 'convert' | 'formats' | 'settings') => void): () => void;
}

export type EngineMethod = 'ping' | 'pdf.open' | 'pdf.close' | 'pdf.renderPage' | 'pdf.extractText' | 'pdf.thumbnails';
export interface EngineCall { id: string; method: EngineMethod; params: unknown }
export interface EngineResult { id: string; ok: boolean; result?: unknown; error?: string }
export interface EngineApi {
  onCall(cb: (call: EngineCall) => void): void;
  sendResult(r: EngineResult): void;
  ready(): void;
}
