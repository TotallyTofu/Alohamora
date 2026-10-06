import fs from 'node:fs';
import heicDecode from 'heic-decode';
import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { runFfmpeg, runFfmpegToBuffer } from './ffmpeg';
import { encodeHeic } from './heif';

export type RasterFmt = 'jpg' | 'png' | 'webp' | 'avif' | 'tiff';

/** Load any supported image as an auto-oriented sharp pipeline. Use `.clone()` to reuse it. */
export async function loadImage(file: Pick<FileInfo, 'path' | 'fmt'>, opts: { density?: number } = {}): Promise<Sharp> {
  try {
    if (file.fmt === 'heic') {
      const { width, height, data } = await heicDecode({ buffer: await fs.promises.readFile(file.path) });
      return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
    }
    if (file.fmt === 'bmp') {
      const png = await runFfmpegToBuffer(['-i', file.path, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
      return sharp(png);
    }
    if (file.fmt === 'svg') return sharp(file.path, { density: opts.density ?? 300 });
    const img = sharp(file.path, { failOn: 'none' }).rotate();   // rotate() = auto-orient from EXIF and drop the tag
    await img.metadata();                                        // reads the header now, so unreadable files fail here with a clear message
    return img;
  } catch (e) {
    throw new UserError("Kabooks couldn't read this image. It may be damaged.", (e as Error).message);
  }
}

/** Encode to a raster format. keepMetadata keeps EXIF/ICC (orientation is already applied). */
export async function saveRaster(img: Sharp, fmt: RasterFmt, out: string, quality: number, keepMetadata = true): Promise<void> {
  let s = keepMetadata ? img.withMetadata() : img;
  if (fmt === 'jpg') s = s.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
  else if (fmt === 'png') s = s.png({ compressionLevel: 9, adaptiveFiltering: true });
  else if (fmt === 'webp') s = s.webp({ quality, effort: 5 });
  else if (fmt === 'avif') s = s.avif({ quality: Math.round(quality * 0.65), effort: 4 });
  else s = s.tiff({ compression: 'lzw' });
  try {
    await s.toFile(out);
  } catch (e) {
    throw new UserError('This image could not be converted. It may be damaged or too large.', (e as Error).message);
  }
}

/** BMP via FFmpeg (sharp has no BMP encoder). */
export async function saveBmp(img: Sharp, out: string, scratchPng: string): Promise<void> {
  await img.flatten({ background: '#ffffff' }).png().toFile(scratchPng);
  await runFfmpeg(['-i', scratchPng, '-frames:v', '1', '-pix_fmt', 'bgr24', out]);
}

/** Display size after orientation (HEIC/BMP need a decode). */
export async function imageSize(file: Pick<FileInfo, 'path' | 'fmt'>): Promise<{ width: number; height: number }> {
  const { info } = await (await loadImage(file)).toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

/** Bake pending operations into raw pixels. Needed before a second rotate()/extract(). */
export async function materialize(img: Sharp): Promise<Sharp> {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/** Tools keep the input format when Kabooks can write it. */
export function sameImageFmt(fmt: Fmt | null, heifEnc: boolean): 'jpg' | 'png' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'heic' {
  if (fmt === 'jpg' || fmt === 'png' || fmt === 'webp' || fmt === 'avif' || fmt === 'tiff' || fmt === 'bmp') return fmt;
  if (fmt === 'heic') return heifEnc ? 'heic' : 'jpg';
  return 'png';   // svg and anything else
}

export async function saveImageAs(img: Sharp, fmt: ReturnType<typeof sameImageFmt>, out: string, quality: number,
  ctx: { tempPath(n: string): string; signal: AbortSignal }, keepMetadata = true): Promise<void> {
  if (fmt === 'bmp') return saveBmp(img, out, ctx.tempPath('bmp.png'));
  if (fmt === 'heic') return encodeHeic(img, out, quality, ctx.tempPath('heic.png'), ctx.signal);
  return saveRaster(img, fmt, out, quality, keepMetadata);
}
