import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { IPC } from '@shared/ipc';
import type { OverlaySize } from '@shared/overlay';
import type { JobRequest, Settings, WheelMode } from '@shared/types';
import { getCapabilities } from './capabilities';
import { inspectFiles } from './inspect';
import { getQueue } from './jobs/queue';
import { getSettings, updateSettings } from './settings';
import { isEngineWindow } from './windows/engineWindow';
import { hideOverlay, openOverlay, resizeOverlay } from './windows/overlayWindow';

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`Invalid ${what}`);
  return v;
}
function existingPath(v: unknown): string {
  if (typeof v !== 'string' || !fs.existsSync(v)) throw new Error('Path does not exist');
  return v;
}
function validateRequest(req: unknown): JobRequest {
  const r = req as JobRequest;
  if (!r || (r.kind !== 'convert' && r.kind !== 'tool')) throw new Error('Invalid job request');
  strings(r.inputs, 'inputs');
  return r;
}

export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !isEngineWindow(w)) w.webContents.send(channel, payload);
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.getCapabilities, () => getCapabilities());
  ipcMain.handle(IPC.getSettings, () => getSettings());
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => updateSettings(patch));
  ipcMain.handle(IPC.pickFiles, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const r = parent ? await dialog.showOpenDialog(parent, { properties: ['openFile', 'multiSelections'] }) : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle(IPC.pickFolder, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle(IPC.inspectFiles, (_e, paths: unknown, deep: unknown) => inspectFiles(strings(paths, 'paths'), deep === true));
  ipcMain.handle(IPC.startJob, (_e, req: unknown) => getQueue().enqueue(validateRequest(req)));
  ipcMain.handle(IPC.cancelJob, (_e, id: unknown) => getQueue().cancel(String(id)));
  ipcMain.handle(IPC.listJobs, () => getQueue().list());
  ipcMain.handle(IPC.reveal, (_e, p: unknown) => shell.showItemInFolder(existingPath(p)));
  ipcMain.handle(IPC.openPath, async (_e, p: unknown) => {
    const err = await shell.openPath(existingPath(p));
    if (err) throw new Error(err);
  });
  ipcMain.handle(IPC.openOverlay, (_e, paths: unknown, mode: WheelMode) => openOverlay(strings(paths, 'paths'), mode === 'tools' ? 'tools' : 'convert', 'window'));
  ipcMain.handle(IPC.closeOverlay, () => hideOverlay());
  ipcMain.handle(IPC.resizeOverlay, (_e, size: OverlaySize) => resizeOverlay(size));
  // preview:* , meta:read and overlay:dropped are registered by later tasks (7.1, 7.10, 8.1, 9.1, 11.6).
}
