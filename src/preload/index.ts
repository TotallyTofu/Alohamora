import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type KabooksApi } from '@shared/ipc';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const api: KabooksApi = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getCapabilities: () => ipcRenderer.invoke(IPC.getCapabilities),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  inspectFiles: (paths, deep) => ipcRenderer.invoke(IPC.inspectFiles, paths, deep),
  startJob: (req) => ipcRenderer.invoke(IPC.startJob, req),
  cancelJob: (id) => ipcRenderer.invoke(IPC.cancelJob, id),
  listJobs: () => ipcRenderer.invoke(IPC.listJobs),
  reveal: (p) => ipcRenderer.invoke(IPC.reveal, p),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  openOverlay: (paths, mode) => ipcRenderer.invoke(IPC.openOverlay, paths, mode),
  closeOverlay: () => ipcRenderer.invoke(IPC.closeOverlay),
  resizeOverlay: (size) => ipcRenderer.invoke(IPC.resizeOverlay, size),
  overlayDropped: (paths) => ipcRenderer.invoke(IPC.overlayDropped, paths),
  previewMedia: (p) => ipcRenderer.invoke(IPC.previewMedia, p),
  previewFrame: (p, t, w) => ipcRenderer.invoke(IPC.previewFrame, p, t, w),
  previewWaveform: (p, w, h) => ipcRenderer.invoke(IPC.previewWaveform, p, w, h),
  previewImage: (req) => ipcRenderer.invoke(IPC.previewImage, req),
  pdfThumbnails: (p, w) => ipcRenderer.invoke(IPC.pdfThumbnails, p, w),
  readMetadata: (p) => ipcRenderer.invoke(IPC.readMetadata, p),
  onJobUpdate: (cb) => on(IPC.evJobUpdate, cb),
  onOverlayInit: (cb) => on(IPC.evOverlayInit, cb),
  onOverlayFiles: (cb) => on(IPC.evOverlayFiles, cb),
  onOverlayDrag: (cb) => on(IPC.evOverlayDrag, cb),
  onSettings: (cb) => on(IPC.evSettings, cb),
  onNavigate: (cb) => on(IPC.evNavigate, cb)
};

contextBridge.exposeInMainWorld('kabooks', api);
