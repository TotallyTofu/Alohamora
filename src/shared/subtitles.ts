import { formatSrtTime, formatVttTime, parseTimecode } from './time';

export interface Cue { start: number; end: number; text: string }

const TIME_LINE = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function normalize(input: string): string {
  return input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Works for both SRT and VTT (headers, NOTE, STYLE and cue settings are skipped). */
export function parseSubtitles(input: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of normalize(input).split(/\n{2,}/)) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => TIME_LINE.test(l));
    if (idx === -1) continue;
    const m = TIME_LINE.exec(lines[idx]);
    if (!m) continue;
    const start = parseTimecode(m[1]);
    const end = parseTimecode(m[2]);
    if (start === null || end === null) continue;
    const text = lines.slice(idx + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ start, end: Math.max(start, end), text });
  }
  return cues;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&quot;': '"' };

/** keepBasic=true keeps <i> <b> <u> (valid in SRT). */
export function stripTags(text: string, keepBasic: boolean): string {
  const noTags = text.replace(/<\/?([a-z0-9.]+)[^>]*>/gi, (tag, name: string) =>
    keepBasic && ['i', 'b', 'u'].includes(name.toLowerCase()) ? tag.replace(/\s.*?>/, '>') : '');
  return keepBasic ? noTags : noTags.replace(/&(amp|lt|gt|nbsp|quot);/g, (e) => ENTITIES[e] ?? e);
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${stripTags(c.text, true)}\n`)
    .join('\n');
}

export function toVtt(cues: Cue[]): string {
  return 'WEBVTT\n\n' + cues.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n`).join('\n');
}

export function toPlainText(cues: Cue[]): string {
  return cues.map((c) => stripTags(c.text, false)).join('\n') + '\n';
}

export function shiftCues(cues: Cue[], offsetSec: number): Cue[] {
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start + offsetSec), end: c.end + offsetSec }))
    .filter((c) => c.end > 0);
}

export interface TextToCuesOptions {
  timing: 'reading' | 'fixed';
  secondsPerCue: number;
  charsPerSecond?: number;   // default 15
  maxLineChars?: number;     // default 42
  gapSec?: number;           // default 0.1
}

function wrapTwoLines(text: string, max: number): string {
  if (text.length <= max) return text;
  const mid = Math.floor(text.length / 2);
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best === -1 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

function chunk(line: string, maxChunk: number): string[] {
  const words = line.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChunk) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** One cue per non-empty line (long lines are split), timed by reading speed or a fixed duration. */
export function textToCues(text: string, o: TextToCuesOptions): Cue[] {
  const cps = o.charsPerSecond ?? 15;
  const maxLine = o.maxLineChars ?? 42;
  const gap = o.gapSec ?? 0.1;
  const pieces = normalize(text).split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => chunk(l, maxLine * 2));
  const cues: Cue[] = [];
  let t = 0;
  for (const p of pieces) {
    const dur = o.timing === 'fixed' ? o.secondsPerCue : Math.min(7, Math.max(1.2, p.length / cps));
    cues.push({ start: t, end: t + dur, text: wrapTwoLines(p, maxLine) });
    t += dur + gap;
  }
  return cues;
}
