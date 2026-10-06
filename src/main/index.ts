import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { detectCapabilities } from './capabilities';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  });
  win.once('ready-to-show', () => win.show());
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/index.html`);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  void detectCapabilities();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
