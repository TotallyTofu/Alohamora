import fs from 'node:fs';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { runFfmpegToBuffer } from './engines/ffmpeg';
import { readEpubCover } from './engines/epubReader';
import { loadImage } from './engines/image';

const cache = new Map<string, string>();
const toDataUrl = (b: Buffer): string => `data:image/jpeg;base64,${b.toString('base64')}`;
const SCALE = 'scale=256:256:force_original_aspect_ratio=decrease';

async function build(f: FileInfo): Promise<string | undefined> {
  switch (f.category) {
    case 'image': {
      if (f.fmt === 'heic' || f.fmt === 'bmp') {
        return toDataUrl(await (await loadImage(f)).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer());
      }
      const b = await sharp(f.path, { failOn: 'none', density: 72 }).rotate().resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
      return toDataUrl(b);
    }
    case 'video': {
      if (!f.hasVideo) return undefined;
      const t = Math.min(1, (f.durationSec ?? 0) * 0.1);
      return toDataUrl(await runFfmpegToBuffer(['-ss', t.toFixed(2), '-i', f.path, '-frames:v', '1', '-vf', SCALE, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']));
    }
    case 'audio': {
      if (!f.hasCover) return undefined;
      return toDataUrl(await runFfmpegToBuffer(['-i', f.path, '-map', '0:v:0', '-frames:v', '1', '-vf', SCALE, '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']));
    }
    case 'epub': {
      const cover = await readEpubCover(f.path);
      if (!cover) return undefined;
      return toDataUrl(await sharp(cover).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer());
    }
    default:
      return undefined;
  }
}

export async function makeThumbnail(f: FileInfo): Promise<string | undefined> {
  const st = await fs.promises.stat(f.path);
  const key = `${f.path}|${st.mtimeMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = await build(f);
  if (url) {
    if (cache.size > 200) cache.clear();
    cache.set(key, url);
  }
  return url;
}
