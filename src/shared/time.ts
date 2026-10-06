export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** "1:02:03.5" | "02:03" | "75" | "00:00:01,500" → seconds (null if invalid). */
export function parseTimecode(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Number.isFinite(sec) ? sec : null;
}

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');

/** 5.41 → "0:05.41"; 3725.5 → "1:02:05.50" (like the crop screenshot). */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const cs = Math.floor((rest - Math.floor(rest)) * 100);
  const core = `${pad(rest)}.${pad(cs)}`;
  return h > 0 ? `${h}:${pad(m)}:${core}` : `${m}:${core}`;
}

function hms(sec: number, sep: ',' | '.'): string {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export const formatSrtTime = (sec: number): string => hms(sec, ',');
export const formatVttTime = (sec: number): string => hms(sec, '.');

/** 65 → "1:05"; 3725 → "1:02:05" */
export function formatDuration(sec: number): string {
  const s = Math.round(Math.max(0, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Explorer-style sizes (1024 based): "12.3 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
