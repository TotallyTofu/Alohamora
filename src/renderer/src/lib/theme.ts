import type { Settings } from '@shared/types';
import { api } from './api';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
let current: Settings | null = null;

export function applyTheme(s: Settings): void {
  current = s;
  const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.contrast = s.highContrastAccent ? 'high' : 'normal';
}

export async function initTheme(): Promise<void> {
  applyTheme(await api.getSettings());
  api.onSettings(applyTheme);
  mq.addEventListener('change', () => { if (current) applyTheme(current); });
}
