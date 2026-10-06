import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathKey } from '../util';

let pending: string[] = [];
let timer: NodeJS.Timeout | null = null;

/** Existing file/folder paths from argv (ignores flags, the exe, and in dev the project folder). */
export function filesFromArgv(argv: string[]): string[] {
  const appKey = pathKey(app.getAppPath());
  const exeKey = pathKey(process.execPath);
  return argv.slice(1).filter((a) => {
    if (!a || a.startsWith('-') || a.startsWith('psn_')) return false;    // macOS may pass -psn_… process serial numbers
    const key = pathKey(a);
    if (key === exeKey || key === appKey) return false;
    if (!app.isPackaged && key.startsWith(appKey + path.sep)) return false;
    return fs.existsSync(path.resolve(a));
  });
}

/** Explorer may start one process per selected file: batch everything that arrives within 350 ms. */
export function queueFiles(files: string[], open: (paths: string[]) => void): void {
  if (files.length === 0) return;
  pending.push(...files);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const batch = [...new Set(pending)];
    pending = [];
    timer = null;
    open(batch);
  }, 350);
}
