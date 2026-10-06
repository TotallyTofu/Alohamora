import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC, type EngineCall, type EngineMethod, type EngineResult } from '@shared/ipc';
import { log } from '../log';
import { preloadPath, rendererUrl } from '../paths';

let win: BrowserWindow | null = null;
let ready: Promise<void> | null = null;
let listening = false;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

function listen(): void {
  if (listening) return;
  listening = true;
  ipcMain.on(IPC.engineResult, (_e, r: EngineResult) => {
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    clearTimeout(p.timer);
    if (r.ok) p.resolve(r.result);
    else p.reject(new Error(r.error ?? 'Engine error'));
  });
}

export function startEngine(): Promise<void> {
  if (ready) return ready;
  listen();
  ready = new Promise<void>((resolve) => {
    ipcMain.once(IPC.engineReady, () => resolve());
    win = new BrowserWindow({
      show: false, width: 900, height: 700,
      webPreferences: { preload: preloadPath('engine'), sandbox: true, contextIsolation: true, backgroundThrottling: false }
    });
    void win.loadURL(rendererUrl('engine'));
    win.webContents.on('render-process-gone', (_e, d) => { log.error('Engine crashed', d.reason); resetEngine(); });
    win.on('closed', () => resetEngine());
  });
  return ready;
}

function resetEngine(): void {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Engine stopped')); }
  pending.clear();
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
  ready = null;
}

export function isEngineWindow(w: BrowserWindow): boolean {
  return w === win;
}

export async function callEngine<T>(method: EngineMethod, params: unknown, timeoutMs = 180_000): Promise<T> {
  await startEngine();
  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Engine call ${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    const call: EngineCall = { id, method, params };
    win?.webContents.send(IPC.engineCall, call);
  });
}
