// tray.ts — Windows/Linux: system tray · macOS: menu bar (template image tinted by the system)
import { app, Menu, nativeImage, Tray } from 'electron';
import { setTrayActive } from '../appState';
import { isMac, trayIconPath } from '../paths';
import { showMainWindow } from '../windows/mainWindow';

let tray: Tray | null = null;

export function createTray(): void {
  if (tray) return;
  const image = nativeImage.createFromPath(trayIconPath());      // macOS picks trayTemplate@2x.png automatically
  if (isMac) image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Kabooks — drop files to convert');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Kabooks', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit Kabooks', click: () => app.quit() }
  ]));
  if (!isMac) tray.on('click', () => showMainWindow());          // macOS: click opens the menu (convention)
  setTrayActive(true);
}

/** macOS only: hide/show the Dock icon (menu-bar-only mode, like many utilities). */
export function setDockVisible(visible: boolean): void {
  if (!isMac || !app.dock) return;
  if (visible) void app.dock.show(); else app.dock.hide();
}
