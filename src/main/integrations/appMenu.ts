import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc';
import { getMainWindow, showMainWindow } from '../windows/mainWindow';

/** macOS needs a real application menu (otherwise ⌘C/⌘V/⌘Q don't work). Windows/Linux: no menu bar. */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  const openSettings = (): void => { showMainWindow(); getMainWindow()?.webContents.send(IPC.evNavigate, 'settings'); };
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: openSettings },
        { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
