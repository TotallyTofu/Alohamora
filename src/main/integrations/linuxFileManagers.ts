import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selfCommand } from './loginItem';

const NAUTILUS = path.join(os.homedir(), '.local', 'share', 'nautilus', 'scripts', 'Convert with Alohamora');
const DOLPHIN = path.join(os.homedir(), '.local', 'share', 'kio', 'servicemenus', 'alohamora.desktop');

/** Settings → "File manager menu" (reuses settings.contextMenu on Linux). */
export function setLinuxFileManagerMenus(enabled: boolean): void {
  if (process.platform !== 'linux') return;
  if (!enabled) { fs.rmSync(NAUTILUS, { force: true }); fs.rmSync(DOLPHIN, { force: true }); return; }
  const cmd = selfCommand().map((p) => `"${p}"`).join(' ');
  // Nautilus (GNOME Files): Scripts submenu; selected files are passed as arguments.
  fs.mkdirSync(path.dirname(NAUTILUS), { recursive: true });
  fs.writeFileSync(NAUTILUS, `#!/bin/sh\nexec ${cmd} "$@"\n`, { mode: 0o755 });
  // Dolphin (KDE): service menu; KF6 requires the file to be executable.
  fs.mkdirSync(path.dirname(DOLPHIN), { recursive: true });
  fs.writeFileSync(DOLPHIN, [
    '[Desktop Entry]', 'Type=Service', 'MimeType=all/allfiles;', 'Actions=convert;', 'X-KDE-Priority=TopLevel', '',
    '[Desktop Action convert]', 'Name=Convert with Alohamora', 'Icon=alohamora', `Exec=${cmd} %F`, ''
  ].join('\n'), { mode: 0o755 });
}
