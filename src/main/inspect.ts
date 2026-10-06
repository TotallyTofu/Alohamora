import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { categoryOf, extOf, fmtFromExt } from '@shared/formats';
import { splitName } from '@shared/naming';
import type { FileInfo } from '@shared/types';
import { probe } from './engines/ffmpeg';
import { imageSize } from './engines/image';
import { log } from './log';
import { makeThumbnail } from './thumbnails';
import { mapLimit } from './util';

const MAX_FILES = 500;

/** Folders → their direct files (sorted). De-duplicates. */
export async function expandPaths(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      if (st.isDirectory()) {
        const entries = await fs.promises.readdir(p, { withFileTypes: true });
        for (const e of entries.filter((x) => x.isFile()).sort((a, b) => a.name.localeCompare(b.name))) out.push(path.join(p, e.name));
      } else if (st.isFile()) {
        out.push(p);
      }
    } catch {
      /* ignore missing paths */
    }
    if (out.length >= MAX_FILES) break;
  }
  return [...new Set(out.map((p) => path.resolve(p)))].slice(0, MAX_FILES);
}

export function inspectBasic(filePath: string): FileInfo {
  const name = path.basename(filePath);
  const ext = extOf(filePath);
  const fmt = fmtFromExt(ext);
  let size = 0;
  try { size = fs.statSync(filePath).size; } catch { /* missing */ }
  return { path: filePath, name, base: splitName(name).base, ext, fmt, category: fmt ? categoryOf(fmt) : null, size };
}

export async function inspectDeep(info: FileInfo): Promise<FileInfo> {
  const out: FileInfo = { ...info, deep: true };
  try {
    if (out.category === 'video' || out.category === 'audio') {
      const p = await probe(out.path);
      out.durationSec = p.durationSec;
      out.hasVideo = !!p.video;
      out.hasAudio = !!p.audio;
      out.hasCover = p.hasCover;
      if (p.video) { out.width = p.video.displayWidth; out.height = p.video.displayHeight; out.videoCodec = p.video.codec; out.fps = p.video.fps; }
      if (p.audio) { out.audioCodec = p.audio.codec; out.sampleRate = p.audio.sampleRate; out.channels = p.audio.channels; }
    } else if (out.category === 'image' && out.fmt !== 'heic' && out.fmt !== 'bmp') {
      const m = await sharp(out.path, { failOn: 'none' }).metadata();
      const swap = (m.orientation ?? 1) >= 5;
      out.width = swap ? m.height : m.width;
      out.height = swap ? m.width : m.height;
    } else if (out.category === 'image') {
      const s = await imageSize(out);       // HEIC / BMP need a real decode
      out.width = s.width;
      out.height = s.height;
    }
    out.thumbnail = await makeThumbnail(out);
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    log.warn('inspectDeep failed', out.path, e);
  }
  return out;
}

export async function inspectFiles(paths: string[], deep: boolean): Promise<FileInfo[]> {
  const basic = (await expandPaths(paths)).map(inspectBasic);
  return deep ? mapLimit(basic, 4, inspectDeep) : basic;
}
