import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

/** "win32-x64", "darwin-arm64", "linux-x64", … (folder name under resources/bin in development). */
export const platformKey = (): string => `${process.platform}-${process.arch}`;
const exeName = (name: string): string => (isWin ? `${name}.exe` : name);

/** resources/ in dev, process.resourcesPath when packaged. */
export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
}
/** Packaged: electron-builder copies resources/bin/<platform>-<arch> to <resources>/bin (Task 13.1). */
export function binDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(resourcesRoot(), 'bin', platformKey());
}
export const ffmpegPath = (): string => path.join(binDir(), exeName('ffmpeg'));
export const ffprobePath = (): string => path.join(binDir(), exeName('ffprobe'));
/** Bundled heif-enc (Windows). Linux uses the system one on PATH; macOS uses sips (see capabilities.ts). */
export const heifEncPath = (): string => path.join(binDir(), 'heif', exeName('heif-enc'));
export const macDragHelperPath = (): string => path.join(binDir(), 'alohamora-drag-helper');
export const tessdataDir = (): string => path.join(resourcesRoot(), 'tessdata');
/** macOS uses a black "template" image so the menu bar can tint it; Windows/Linux use the coloured icon. */
export const trayIconPath = (): string => path.join(resourcesRoot(), isMac ? 'trayTemplate.png' : 'tray.png');

/** THIRD_PARTY_NOTICES.md: shipped in the app resources (the project root when running from source). */
export const noticesPath = (): string =>
  app.isPackaged ? path.join(process.resourcesPath, 'THIRD_PARTY_NOTICES.md') : path.join(app.getAppPath(), 'THIRD_PARTY_NOTICES.md');

/** Find an executable on PATH (Linux/macOS), or null. */
export function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exeName(name));
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}

export function userDir(...parts: string[]): string {
  const p = path.join(app.getPath('userData'), ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
export const cacheDir = (...parts: string[]): string => userDir('cache', ...parts);

export function jobsTempRoot(): string {
  const p = path.join(app.getPath('temp'), 'alohamora-jobs');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export const preloadPath = (name: 'index' | 'engine'): string => path.join(__dirname, '../preload', `${name}.js`);
export const rendererDir = (): string => path.join(__dirname, '../renderer');

export function rendererUrl(page: 'index' | 'engine', query = ''): string {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && dev) return `${dev}/${page}.html${query}`;
  return `app://alohamora/${page}.html${query}`;
}
