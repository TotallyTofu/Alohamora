import { Notification, shell } from 'electron';
import type { JobUpdate } from '@shared/types';
import { getSettings } from './settings';
import { getMainWindow } from './windows/mainWindow';
import { isOverlayVisible } from './windows/overlayWindow';

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function notifyJobFinished(u: JobUpdate): void {
  const s = getSettings();
  if (u.status === 'done' && s.revealWhenDone && u.outputs[0]) shell.showItemInFolder(u.outputs[0]);
  if (!s.notifyWhenDone || !Notification.isSupported()) return;
  if (u.status !== 'done' && u.status !== 'error') return;
  if (isOverlayVisible() || getMainWindow()?.isFocused()) return;   // user is already looking
  const body = u.status === 'done'
    ? `${u.outputs.length === 1 ? baseName(u.outputs[0]) : `${u.outputs.length} files saved`}${u.note ? ` · ${u.note}` : ''}`
    : u.error ?? 'Something went wrong';
  const n = new Notification({ title: u.status === 'done' ? `${u.label} — done` : `${u.label} failed`, body, silent: true });
  n.on('click', () => { if (u.outputs[0]) shell.showItemInFolder(u.outputs[0]); });
  n.show();
}
