import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { EVENTS, type AlohamoraApi } from '@shared/ipc';

const win = getCurrentWebviewWindow();
/** listen() registers asynchronously; uiReady() waits for these so no early event is lost. */
const registering: Array<Promise<unknown>> = [];

/** Subscribe to an event sent to this window; returns an unsubscribe function (listen() is async). */
function on<T>(event: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const unlisten = win.listen<T>(event, (e) => cb(e.payload));
    registering.push(unlisten);
    return () => { void unlisten.then((off) => off()); };
  };
}

/**
 * Commands reject with `{ message }` (Rust `CmdError`). Re-throw as a real Error so callers can use `e.message`
 * exactly as with Electron's ipcRenderer.invoke.
 */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    throw new Error(message);
  }
}

/** Every backend call the UI makes. Argument names are camelCase here; Tauri maps them to snake_case in Rust. */
export const api: AlohamoraApi = {
  getCapabilities: () => call('get_capabilities'),
  getSettings: () => call('get_settings'),
  setSettings: (patch) => call('set_settings', { patch }),
  pickFiles: () => call('pick_files'),
  pickFolder: () => call('pick_folder'),
  inspectFiles: (paths, deep) => call('inspect_files', { paths, deep }),
  startJob: (req) => call('start_job', { req }),
  cancelJob: (id) => call('cancel_job', { id }),
  listJobs: () => call('list_jobs'),
  reveal: (path) => call('reveal', { path }),
  openPath: (path) => call('open_path', { path }),
  openNotices: () => call('open_notices'),
  openOverlay: (paths, mode) => call('open_overlay', { paths, mode }),
  closeOverlay: () => call('close_overlay'),
  resizeOverlay: (size) => call('resize_overlay', { size }),
  overlayDropped: (paths) => call('overlay_dropped', { paths }),
  previewMedia: (path) => call('preview_media', { path }),
  previewFrame: (path, timeSec, maxWidth) => call('preview_frame', { path, timeSec, maxWidth }),
  previewWaveform: (path, width, height) => call('preview_waveform', { path, width, height }),
  previewImage: (req) => call('preview_image', { req }),
  pdfThumbnails: (path, maxWidth) => call('pdf_thumbnails', { path, maxWidth }),
  readMetadata: (path) => call('read_metadata', { path }),
  uiReady: async () => { await Promise.all(registering); await call('ui_ready'); },
  onJobUpdate: on(EVENTS.jobUpdate),
  onOverlayInit: on(EVENTS.overlayInit),
  onOverlayFiles: on(EVENTS.overlayFiles),
  onOverlayDrag: on(EVENTS.overlayDrag),
  onSettings: on(EVENTS.settings),
  onNavigate: on(EVENTS.navigate),
  onDrop: on(EVENTS.drop)
};

/** "main" or "overlay": which view this window shows. */
export const windowLabel = (): string => win.label;
