// loginItem.ts — Windows/macOS: OS login items · Linux: ~/.config/autostart/alohamora.desktop
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isLinux } from '../paths';

/** The command that starts this app (AppImage path when running as AppImage). */
export function selfCommand(): string[] {
  if (process.env.APPIMAGE) return [process.env.APPIMAGE];
  return app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()];
}

export function setLoginItem(enabled: boolean): void {
  if (!isLinux) {
    app.setLoginItemSettings({ openAtLogin: enabled, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
    return;
  }
  const file = path.join(os.homedir(), '.config', 'autostart', 'alohamora.desktop');
  if (!enabled) { fs.rmSync(file, { force: true }); return; }
  const exec = [...selfCommand(), '--hidden'].map((p) => `"${p}"`).join(' ');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Alohamora\nExec=${exec}\nX-GNOME-Autostart-enabled=true\nNoDisplay=false\n`);
}
