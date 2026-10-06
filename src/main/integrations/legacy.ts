import { app } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { log } from '../log';

const run = promisify(execFile);

/**
 * The app used to be called Kabooks. The first time the renamed app starts, bring the saved settings across and (on
 * Windows) remove the old Send to / right-click / login entries, because the new settings re-create them under the new name.
 * Runs once: it does nothing when a settings file already exists for the new name.
 */
export async function migrateFromKabooks(): Promise<void> {
  const target = path.join(app.getPath('userData'), 'settings.json');
  if (fs.existsSync(target)) return;
  const old = ['Kabooks', 'kabooks'].map((n) => path.join(app.getPath('appData'), n, 'settings.json')).find((p) => fs.existsSync(p));
  if (!old) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(old, target);
    log.info('Copied the saved settings from the Kabooks version');
  } catch (e) {
    log.warn('Could not copy the old settings', e);
    return;
  }
  if (process.platform !== 'win32') return;
  fs.rmSync(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Kabooks.lnk'), { force: true });
  const quiet = { windowsHide: true };
  await run('reg', ['delete', 'HKCU\\Software\\Classes\\*\\shell\\Kabooks', '/f'], quiet).catch(() => undefined);
  await run('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'com.kabooks.app', '/f'], quiet).catch(() => undefined);
}
