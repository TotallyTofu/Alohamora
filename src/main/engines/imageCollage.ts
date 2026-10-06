import sharp from 'sharp';
import type { OverlayOptions, Sharp } from 'sharp';
import { collageCells } from '@shared/collageLayout';
import type { CollageOptions } from '@shared/toolOptions';
import type { FileInfo } from '@shared/types';
import { throwIfAborted } from '../errors';
import { loadImage } from './image';
import { roundedMask } from './imageBackground';

/** Compose images into one canvas. Sequential on purpose (keeps memory low). `width` overrides o.width (previews use 800). */
export async function composeCollage(files: FileInfo[], o: CollageOptions, width = o.width, signal?: AbortSignal): Promise<Sharp> {
  const layout = collageCells(files.length, o.layout, width, o.gap);
  const layers: OverlayOptions[] = [];
  for (let i = 0; i < files.length; i++) {
    if (signal) throwIfAborted(signal);
    const c = layout.cells[i];
    const w = Math.max(1, Math.round(c.w));
    const h = Math.max(1, Math.round(c.h));
    const cover = o.fit === 'cover';
    const tile = (await loadImage(files[i])).resize(w, h, {
      fit: cover ? 'cover' : 'contain', position: cover ? sharp.strategy.attention : 'centre', background: o.background
    }).ensureAlpha();
    let buf = await tile.png().toBuffer();
    if (o.radius > 0) {
      buf = await sharp(buf).composite([{ input: roundedMask(w, h, Math.round(Math.min(w, h) * o.radius / 100)), blend: 'dest-in' }]).png().toBuffer();
    }
    layers.push({ input: buf, left: Math.round(c.x), top: Math.round(c.y) });
  }
  return sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: o.background } }).composite(layers);
}
