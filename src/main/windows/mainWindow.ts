import { app, BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { isQuitting, isTrayActive } from '../appState';
import { isMac, isWin, preloadPath, rendererUrl, resourcesRoot } from '../paths';
import { getSettings } from '../settings';

let win: BrowserWindow | null = null;

function overlayColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors ? { color: '#161617', symbolColor: '#EDEDED' } : { color: '#F3F3F2', symbolColor: '#1F1F1F' };
}

/** Native window chrome per OS (see OUTLINE §9.5). */
function chromeOptions(): BrowserWindowConstructorOptions {
  if (isMac) return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } };      // traffic lights inside our 44 px header
  if (isWin) return { titleBarStyle: 'hidden', titleBarOverlay: { ...overlayColors(), height: 44 } };  // native caption buttons
  return { icon: path.join(resourcesRoot(), 'tray.png') };                                           // Linux: native frame
}

export function createMainWindow(showNow = true): BrowserWindow {
  win = new BrowserWindow({
    width: 1000, height: 720, minWidth: 760, minHeight: 560, show: false, title: 'Kabooks',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161617' : '#F3F3F2',
    ...chromeOptions(),
    webPreferences: { preload: preloadPath('index'), sandbox: true, contextIsolation: true }
  });
  if (showNow) win.once('ready-to-show', () => win?.show());
  void win.loadURL(rendererUrl('index', '?view=main'));
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
    });
  }
  win.on('close', (e) => {
    if (isQuitting()) return;
    // macOS convention: closing the window never quits (⌘Q / menu / menu-bar icon does).
    if (isMac || (getSettings().closeToTray && isTrayActive())) { e.preventDefault(); win?.hide(); }
    else app.quit();
  });
  win.on('closed', () => { win = null; });
  nativeTheme.on('updated', () => { if (win && isWin) win.setTitleBarOverlay({ ...overlayColors(), height: 44 }); });
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function showMainWindow(): void {
  if (!win) createMainWindow();
  win?.show();
  win?.focus();
}
