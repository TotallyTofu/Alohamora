import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KEY = 'HKCU\\Software\\Classes\\*\\shell\\Kabooks';

export async function setContextMenu(enabled: boolean): Promise<void> {
  if (process.platform !== 'win32') return;
  if (!enabled) {
    await run('reg', ['delete', KEY, '/f'], { windowsHide: true }).catch(() => undefined);
    return;
  }
  const exe = process.execPath;
  const command = app.isPackaged ? `"${exe}" "%1"` : `"${exe}" "${app.getAppPath()}" "%1"`;
  await run('reg', ['add', KEY, '/ve', '/d', 'Convert with Kabooks', '/f'], { windowsHide: true });
  await run('reg', ['add', KEY, '/v', 'Icon', '/d', exe, '/f'], { windowsHide: true });
  await run('reg', ['add', KEY, '/v', 'MultiSelectModel', '/d', 'Player', '/f'], { windowsHide: true });
  await run('reg', ['add', `${KEY}\\command`, '/ve', '/d', command, '/f'], { windowsHide: true });
}
