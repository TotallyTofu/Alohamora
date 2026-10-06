import { app, nativeTheme } from 'electron';
import sharp from 'sharp';
import { IPC } from '@shared/ipc';
import { setQuitting } from './appState';
import { detectCapabilities } from './capabilities';
import { broadcast, registerIpc } from './ipc';
import { initQueue } from './jobs/queue';
import { log } from './log';
import { notifyJobFinished } from './notify';
import { detectHardwareVideo } from './engines/hwVideo';
import { runHousekeeping } from './housekeeping';
import { registerProtocolHandlers, registerSchemes } from './protocol';
import { blockNetwork, hardenWebContents } from './security';
import { getSettings, loadSettings, onSettingsChanged } from './settings';
import { filesFromArgv, queueFiles } from './integrations/argv';
import { installAppMenu } from './integrations/appMenu';
import { applyIntegrations } from './integrations';
import { migrateFromKabooks } from './integrations/legacy';
import { createTray } from './integrations/tray';
import { startEngine } from './windows/engineWindow';
import { createMainWindow, showMainWindow } from './windows/mainWindow';
import { createOverlayWindow, openOverlay } from './windows/overlayWindow';
import { runSelfTest } from './selftest';

sharp.cache(false);                         // avoid file locks (Windows) and stale reads
if (process.platform === 'win32') app.setAppUserModelId('com.alohamora.app');           // Windows notifications
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');  // transparent overlay
registerSchemes();                          // must run before 'ready'

let resolveStarted: () => void = () => undefined;
const started = new Promise<void>((r) => { resolveStarted = r; });
let launchedWithFiles = false;
/** Files handed to us by the OS open the wheel as soon as the app has finished starting. */
const openFromOs = (paths: string[]): void => { void started.then(() => openOverlay(paths, 'convert', 'argv')); };

// macOS: Finder "Open With", Dock drop, `open -a Alohamora file` (can fire before 'ready')
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  launchedWithFiles = true;
  queueFiles([filePath], openFromOs);
});

if (!process.argv.includes('--selftest') && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('before-quit', () => setQuitting());
  app.on('window-all-closed', () => { /* keep running; quitting is explicit */ });
  app.on('activate', () => showMainWindow());   // macOS: clicking the Dock icon re-opens the window
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) queueFiles(files, openFromOs);
    else showMainWindow();
  });

  void app.whenReady().then(async () => {
    installAppMenu();                           // macOS: App/Edit/Window menus (⌘C/⌘V, ⌘,); others: no menu bar
    registerProtocolHandlers();
    blockNetwork();
    hardenWebContents();
    await migrateFromKabooks();                 // renamed from Kabooks: keep the user's settings
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
    const initial = filesFromArgv(process.argv);
    createMainWindow(initial.length === 0 && !launchedWithFiles && !process.argv.includes('--hidden'));
    createOverlayWindow();
    createTray();
    applyIntegrations(getSettings());
    onSettingsChanged((s, prev) => {
      nativeTheme.themeSource = s.theme;
      broadcast(IPC.evSettings, s);
      applyIntegrations(s, prev);
    });
    resolveStarted();
    void detectHardwareVideo();                 // background: 1-frame test encodes, never blocks start-up
    void runHousekeeping();
    queueFiles(initial, openFromOs);
    log.info('Alohamora ready');
  });
}
