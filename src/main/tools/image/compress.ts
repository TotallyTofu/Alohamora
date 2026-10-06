import fs from 'node:fs';
import type { FileInfo } from '@shared/types';
import { formatBytes } from '@shared/time';
import { withDefaults, type ImageCompressOptions } from '@shared/toolOptions';
import { loadImage } from '../../engines/image';
import type { ToolRunFn } from '../index';

export async function compressImageTo(file: FileInfo, o: ImageCompressOptions, out: string | null): Promise<{ buffer: Buffer; fmt: string }> {
  const fmt = o.format === 'keep' ? (['jpg', 'png', 'webp', 'avif'].includes(file.fmt ?? '') ? (file.fmt as string) : 'jpg') : o.format;
  let img = await loadImage(file);
  if (o.maxSide > 0) img = img.resize({ width: o.maxSide, height: o.maxSide, fit: 'inside', withoutEnlargement: true });
  if (!o.stripMetadata) img = img.withMetadata();
  if (fmt === 'png') img = img.png({ palette: true, quality: o.quality, effort: 7, compressionLevel: 9 });
  else if (fmt === 'webp') img = img.webp({ quality: o.quality, effort: 5 });
  else if (fmt === 'avif') img = img.avif({ quality: Math.round(o.quality * 0.65), effort: 4 });
  else img = img.flatten({ background: '#ffffff' }).jpeg({ quality: o.quality, mozjpeg: true });
  const buffer = await img.toBuffer();
  if (out) await fs.promises.writeFile(out, buffer);
  return { buffer, fmt };
}

export const runImageCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageCompressOptions>('image.compress', options);
  const fmt = o.format === 'keep' ? (['jpg', 'png', 'webp', 'avif'].includes(file.fmt ?? '') ? (file.fmt as string) : 'jpg') : o.format;
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'compressed' });
  const { buffer } = await compressImageTo(file, o, out);
  if (buffer.length >= file.size) { ctx.dropOutput(out); ctx.note(`${file.name} is already small`); return; }
  ctx.note(`${formatBytes(file.size)} → ${formatBytes(buffer.length)} (−${Math.round((1 - buffer.length / file.size) * 100)}%)`);
};
