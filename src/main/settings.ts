import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<(s: Settings, prev: Settings) => void>();

const file = (): string => path.join(app.getPath('userData'), 'settings.json');

/** Keep only known keys whose type matches the default. */
function sanitize(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (def === null ? v === null || typeof v === 'string' : Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def) out[k] = v;
  }
  return out as Partial<Settings>;
}

export function loadSettings(): Settings {
  try {
    current = { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(fs.readFileSync(file(), 'utf8'))) };
  } catch {
    current = { ...DEFAULT_SETTINGS };
  }
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const prev = current;
  current = { ...current, ...sanitize(patch) };
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
  fs.renameSync(tmp, file());
  for (const l of listeners) l(current, prev);
  return current;
}

export function onSettingsChanged(cb: (s: Settings, prev: Settings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
