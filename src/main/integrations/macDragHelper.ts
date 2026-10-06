import { spawn, type ChildProcess } from 'node:child_process';
import { screen } from 'electron';
import type { WheelMode } from '@shared/types';
import { inspectFiles } from '../inspect';
import { log } from '../log';
import { macDragHelperPath } from '../paths';
import { overlayDragEnd, overlayDragFiles, overlayDragMode, overlayDragStart } from '../windows/overlayWindow';

let child: ChildProcess | null = null;
let shown = false;
let alt = false;
const mode = (): WheelMode => (alt ? 'tools' : 'convert');

async function onEvent(ev: { t: string; shift?: boolean; alt?: boolean; paths?: string[] }): Promise<void> {
  if (ev.t === 'drag') { alt = false; return; }
  if (ev.t === 'mods') {
    alt = !!ev.alt;
    if (shown) overlayDragMode(mode());
    return;
  }
  if (ev.t === 'files') {
    const paths = ev.paths ?? [];
    const basic = paths.length ? await inspectFiles(paths, false) : undefined;   // instant: formats
    shown = true;
    overlayDragStart(mode(), screen.getCursorScreenPoint(), basic);             // basic === undefined → "Drop to choose"
    if (basic?.length) overlayDragFiles(mode(), await inspectFiles(paths, true)); // then thumbnails
    return;
  }
  if (ev.t === 'up' && shown) { shown = false; overlayDragEnd(); }
}

export function startMacDragHelper(): void {
  if (child || process.platform !== 'darwin') return;
  child = spawn(macDragHelperPath(), [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) { try { void onEvent(JSON.parse(line)); } catch { /* ignore malformed */ } }
  });
  child.on('exit', (code) => { log.warn('drag helper exited', code); child = null; });
  log.info('macOS drag helper started');
}

export function stopMacDragHelper(): void {
  child?.stdin?.end();          // helper exits when stdin closes
  child?.kill();
  child = null;
}
