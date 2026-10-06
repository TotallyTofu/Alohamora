import { describe, expect, it } from 'vitest';
import { FORMATS } from './formats';
import { makeCaps } from './testCaps';
import type { Category, FileInfo, Fmt } from './types';
import { buildWheel } from './wheelItems';

function fi(path: string, fmt: Fmt | null, category: Category | null): FileInfo {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return { path, name, base: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot + 1) : '', fmt, category, size: 1000 };
}

const png = fi('/a/pic.png', 'png', 'image');
const mp4 = fi('/a/clip.mp4', 'mp4', 'video');
const mp3 = fi('/a/song.mp3', 'mp3', 'audio');
const pdf = fi('/a/doc.pdf', 'pdf', 'pdf');

describe('buildWheel (convert)', () => {
  it('a PNG offers 8 targets without png and heic', () => {
    const w = buildWheel([png], 'convert', makeCaps());
    const targets = w.items.map((i) => i.target);
    expect(targets).not.toContain('png');
    expect(targets).not.toContain('heic');
    expect(targets).toContain('pdf');
    expect(targets).toContain('docx');
    expect(w.items).toHaveLength(8);
  });

  it('HEIC is offered on macOS with sips', () => {
    const w = buildWheel([png], 'convert', makeCaps({ platform: 'darwin', heifEnc: true, heicTool: 'sips' }));
    expect(w.items.map((i) => i.target)).toContain('heic');
  });

  it('MP4 + MP3 share only mp3', () => {
    const w = buildWheel([mp4, mp3], 'convert', makeCaps());
    expect(w.items.map((i) => i.target)).toEqual(['mp3']);
    expect(w.mixed).toBe(true);
  });

  it('marks card conversions', () => {
    const w = buildWheel([png], 'convert', makeCaps());
    expect(w.items.find((i) => i.target === 'svg')?.needsOptions).toBe(true);
    expect(w.items.find((i) => i.target === 'jpg')?.needsOptions).toBe(false);
  });

  it('labels come from FORMATS', () => {
    const w = buildWheel([mp4], 'convert', makeCaps());
    expect(w.items.find((i) => i.target === 'webm')?.label).toBe(FORMATS.webm.label);
  });

  it('unsupported files give an empty wheel with a reason', () => {
    const w = buildWheel([fi('/a/x.zip', null, null)], 'convert', makeCaps());
    expect(w.items).toEqual([]);
    expect(w.emptyReason).toContain("isn't supported");
  });

  it('files already in the only target format are skipped', () => {
    const epub = fi('/a/b.epub', 'epub', 'epub');
    expect(buildWheel([epub], 'convert', makeCaps()).items.map((i) => i.target)).toEqual(['pdf']);
    expect(buildWheel([pdf], 'convert', makeCaps()).items.map((i) => i.target)).not.toContain('pdf');
  });
});

describe('buildWheel (tools)', () => {
  it('mixed kinds → no tools, reason mentions Mixed', () => {
    const w = buildWheel([mp4, mp3], 'tools', makeCaps());
    expect(w.items).toEqual([]);
    expect(w.emptyReason).toContain('Mixed');
  });

  it('PDF merge needs two files', () => {
    const two = buildWheel([pdf, fi('/a/b.pdf', 'pdf', 'pdf')], 'tools', makeCaps());
    expect(two.items.map((i) => i.toolId)).toContain('pdf.merge');
    const one = buildWheel([pdf], 'tools', makeCaps());
    expect(one.items.map((i) => i.toolId)).not.toContain('pdf.merge');
  });

  it('video.mute is instant', () => {
    const w = buildWheel([mp4], 'tools', makeCaps());
    expect(w.items.find((i) => i.toolId === 'video.mute')?.needsOptions).toBe(false);
    expect(w.items.find((i) => i.toolId === 'video.trim')?.needsOptions).toBe(true);
  });
});
