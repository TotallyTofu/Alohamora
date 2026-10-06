import { app, BrowserWindow, screen } from 'electron';
import { IPC } from '@shared/ipc';
import { WHEEL_STAGE, type OverlaySize } from '@shared/overlay';
import type { OverlayInit, Point, WheelMode } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { inspectFiles } from '../inspect';
import { preloadPath, rendererUrl } from '../paths';

let win: BrowserWindow | null = null;
let loaded: Promise<void> | null = null;
let anchor: Point = { x: 0, y: 0 };

export function createOverlayWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000', title: 'Kabooks',
    webPreferences: { preload: preloadPath('index'), sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  if (process.platform === 'darwin') {
    // Show over full-screen apps and on every Space, without turning the app into a background-only process.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  loaded = win.loadURL(rendererUrl('index', '?view=overlay'));
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.openDevTools({ mode: 'detach' });
    });
  }
  win.on('closed', () => { win = null; loaded = null; });
  return win;
}

/** Position the window so that the wheel centre (or the window centre) sits at `anchor`, clamped to the screen. */
function place(size: OverlaySize): void {
  if (!win) return;
  const wa = screen.getDisplayNearestPoint(anchor).workArea;
  const width = Math.min(size.width, wa.width);
  const height = Math.min(size.height, wa.height);
  let x = size.anchor === 'wheel' ? anchor.x - WHEEL_STAGE.anchorX : anchor.x - Math.round(width / 2);
  let y = size.anchor === 'wheel' ? anchor.y - WHEEL_STAGE.anchorY : anchor.y - Math.round(height / 2);
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

export async function openOverlay(paths: string[], mode: WheelMode, source: OverlayInit['source'], at?: Point): Promise<void> {
  if (!win) createOverlayWindow();
  await loaded;
  const basic = await inspectFiles(paths, false);
  if (basic.length === 0 || !win) return;
  anchor = at ?? screen.getCursorScreenPoint();
  place({ width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, anchor: 'wheel' });
  const init: OverlayInit = { files: basic, mode, caps: getCapabilities(), source };
  win.webContents.send(IPC.evOverlayInit, init);
  win.show();
  win.focus();
  const deep = await inspectFiles(basic.map((f) => f.path), true);
  win?.webContents.send(IPC.evOverlayFiles, deep);
}

export function resizeOverlay(size: OverlaySize): void { place(size); }
export function hideOverlay(): void { win?.hide(); }
export function isOverlayVisible(): boolean { return !!win && win.isVisible(); }
export function getOverlayWindow(): BrowserWindow | null { return win; }
export function setOverlayAnchor(p: Point): void { anchor = p; }
