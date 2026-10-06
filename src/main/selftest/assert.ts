import fs from 'node:fs';
import { probe } from '../engines/ffmpeg';
import sharp from 'sharp';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

export function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function expectCount(outputs: string[], n: number): void {
  check(outputs.length === n, `expected ${n} output(s), got ${outputs.length}`);
}

export function expectNonEmpty(file: string): void {
  check(fs.existsSync(file) && fs.statSync(file).size > 0, `${file} is missing or empty`);
}

export async function expectStreams(file: string, e: { video?: string | null; audio?: string | null; durationSec?: number; tolerance?: number }): Promise<void> {
  expectNonEmpty(file);
  const p = await probe(file);
  if (e.video !== undefined) check(e.video === null ? !p.video : p.video?.codec === e.video, `video codec: expected ${e.video}, got ${p.video?.codec ?? 'none'}`);
  if (e.audio !== undefined) check(e.audio === null ? !p.audio : p.audio?.codec === e.audio, `audio codec: expected ${e.audio}, got ${p.audio?.codec ?? 'none'}`);
  if (e.durationSec !== undefined) {
    check(Math.abs(p.durationSec - e.durationSec) <= (e.tolerance ?? 0.5), `duration: expected ~${e.durationSec}s, got ${p.durationSec}s`);
  }
}

export function expectMagic(file: string, offset: number, ascii: string): void {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(ascii.length);
  fs.readSync(fd, buf, 0, ascii.length, offset);
  fs.closeSync(fd);
  check(buf.toString('latin1') === ascii, `${file}: expected "${ascii}" at byte ${offset}, got "${buf.toString('latin1')}"`);
}

export function expectTextIncludes(file: string, text: string): void {
  check(fs.readFileSync(file, 'utf8').includes(text), `${file} does not contain "${text}"`);
}

export async function expectImage(file: string, format: string, dims?: { width: number; height: number }): Promise<void> {
  expectNonEmpty(file);
  const m = await sharp(file).metadata();
  check(m.format === format, `image format: expected ${format}, got ${m.format}`);
  if (dims) check(m.width === dims.width && m.height === dims.height, `size: expected ${dims.width}x${dims.height}, got ${m.width}x${m.height}`);
}

export async function expectPdfPages(file: string, pages: number | 'any'): Promise<number> {
  expectNonEmpty(file);
  const doc = await PDFDocument.load(fs.readFileSync(file));
  const n = doc.getPageCount();
  if (pages !== 'any') check(n === pages, `PDF pages: expected ${pages}, got ${n}`);
  return n;
}
export async function expectZipEntries(file: string, names: string[]): Promise<JSZip> {
  expectNonEmpty(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const n of names) check(zip.file(n) !== null, `zip ${file} has no entry ${n}`);
  return zip;
}
