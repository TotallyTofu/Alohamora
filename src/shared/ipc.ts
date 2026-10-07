import type { OverlaySize } from './overlay';
import type {
  Capabilities, DragState, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate,
  MetadataInfo, OverlayInit, Settings, WheelMode
} from './types';

/** Event names emitted by the Rust side (src-tauri). */
export const EVENTS = {
  jobUpdate: 'ev:job-update',
  overlayInit: 'ev:overlay-init',
  overlayFiles: 'ev:overlay-files',
  overlayDrag: 'ev:overlay-drag',
  settings: 'ev:settings',
  navigate: 'ev:navigate',
  drop: 'ev:drop'
} as const;

/** A native file drag over / drop on THIS window. x/y are CSS pixels (same as clientX/clientY). */
export interface DropEvent {
  phase: 'enter' | 'over' | 'drop' | 'leave';
  /** Present on 'enter' and 'drop' only. */
  paths?: string[];
  x: number;
  y: number;
  /** Modifier keys sampled by the OS when the event happened. */
  alt: boolean;
  shift: boolean;
}

export interface AlohamoraApi {
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
  /** Tell the backend this window has rendered (the main window is shown then; overlay events start flowing). */
  uiReady(): Promise<void>;
  onJobUpdate(cb: (u: JobUpdate) => void): () => void;
  onOverlayInit(cb: (p: OverlayInit) => void): () => void;
  onOverlayFiles(cb: (files: FileInfo[]) => void): () => void;
  onOverlayDrag(cb: (s: DragState) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onNavigate(cb: (tab: 'convert' | 'formats' | 'settings') => void): () => void;
  onDrop(cb: (e: DropEvent) => void): () => void;
}
