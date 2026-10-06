import { app, nativeTheme } from 'electron';
import sharp from 'sharp';
import { IPC } from '@shared/ipc';
import { setQuitting } from './appState';
import { detectCapabilities } from './capabilities';
import { broadcast, registerIpc } from './ipc';
import { initQueue } from './jobs/queue';
import { log } from './log';
import { notifyJobFinished } from './notify';
import { registerProtocolHandlers, registerSchemes } from './protocol';
import { blockNetwork, hardenWebContents } from './security';
import { loadSettings, onSettingsChanged } from './settings';
import { installAppMenu } from './integrations/appMenu';
import { startEngine } from './windows/engineWindow';
import { createMainWindow, showMainWindow } from './windows/mainWindow';
import { createOverlayWindow } from './windows/overlayWindow';
import { runSelfTest } from './selftest';

sharp.cache(false);                         // avoid file locks (Windows) and stale reads
if (process.platform === 'win32') app.setAppUserModelId('com.kabooks.app');           // Windows notifications
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');  // transparent overlay
registerSchemes();                          // must run before 'ready'

if (!process.argv.includes('--selftest') && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('before-quit', () => setQuitting());
  app.on('window-all-closed', () => { /* keep running; quitting is explicit */ });
  app.on('activate', () => showMainWindow());   // macOS: clicking the Dock icon re-opens the window

  void app.whenReady().then(async () => {
    installAppMenu();                           // macOS: App/Edit/Window menus (⌘C/⌘V, ⌘,); others: no menu bar
    registerProtocolHandlers();
    blockNetwork();
    hardenWebContents();
    const settings = loadSettings();
    nativeTheme.themeSource = settings.theme;
    await detectCapabilities();
    initQueue((u) => broadcast(IPC.evJobUpdate, u), notifyJobFinished);
    registerIpc();
    await startEngine();
    if (process.argv.includes('--selftest')) {
      const code = await runSelfTest(process.argv);
      app.exit(code);
      return;
    }
    createMainWindow();
    createOverlayWindow();
    onSettingsChanged((s) => { nativeTheme.themeSource = s.theme; broadcast(IPC.evSettings, s); });
    log.info('Kabooks ready');
  });
}
