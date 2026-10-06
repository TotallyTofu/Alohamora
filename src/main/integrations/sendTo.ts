import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const lnk = (): string => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Alohamora.lnk');

export function setSendTo(enabled: boolean): boolean {
  if (process.platform !== 'win32') return false;
  if (!enabled) {
    if (fs.existsSync(lnk())) fs.unlinkSync(lnk());
    return true;
  }
  return shell.writeShortcutLink(lnk(), 'create', {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
    description: 'Convert with Alohamora',
    icon: process.execPath,
    iconIndex: 0
  });
}
