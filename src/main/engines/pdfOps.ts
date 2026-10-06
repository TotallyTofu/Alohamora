import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { throwIfAborted } from '../errors';
import { loadImage } from './image';

export type PageSizeOpt = 'fit' | 'a4' | 'letter';
export type MarginOpt = 'none' | 'small' | 'large';
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS: Record<MarginOpt, number> = { none: 0, small: 18, large: 36 };

export interface EmbeddableImage { kind: 'jpg' | 'png'; data: Buffer; width: number; height: number }

/** Original JPEG bytes when safe (no rotation, sRGB/grey); otherwise re-encode (PNG if transparent). */
export async function embeddableImage(file: FileInfo): Promise<EmbeddableImage> {
  if (file.fmt === 'jpg') {
    const m = await sharp(file.path).metadata();
    if ((m.orientation ?? 1) === 1 && (m.space === 'srgb' || m.space === 'b-w') && m.width && m.height) {
      return { kind: 'jpg', data: await fs.promises.readFile(file.path), width: m.width, height: m.height };
    }
  }
  const img = await loadImage(file);
  const opaque = (await img.clone().stats()).isOpaque;          // fully opaque → JPEG (smaller)
  const { data, info } = opaque
    ? await img.flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true })
    : await img.png().toBuffer({ resolveWithObject: true });
  return { kind: opaque ? 'jpg' : 'png', data, width: info.width, height: info.height };
}

export async function imagesToPdf(
  files: FileInfo[], o: { pageSize: PageSizeOpt; margin: MarginOpt }, out: string,
  onProgress: (f: number) => void, signal: AbortSignal
): Promise<void> {
  const pdf = await PDFDocument.create();
  const m = MARGINS[o.margin];
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(signal);
    const img = await embeddableImage(files[i]);
    const emb = img.kind === 'jpg' ? await pdf.embedJpg(img.data) : await pdf.embedPng(img.data);
    let pw: number;
    let ph: number;
    if (o.pageSize === 'fit') {
      const k = Math.min(1, 1190 / Math.max(img.width * 0.75, img.height * 0.75));   // 96 DPI, capped near A3
      pw = img.width * 0.75 * k + 2 * m;
      ph = img.height * 0.75 * k + 2 * m;
    } else {
      const [a, b] = SIZES[o.pageSize];
      [pw, ph] = img.width > img.height ? [b, a] : [a, b];
    }
    const page = pdf.addPage([pw, ph]);
    const scale = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    onProgress((i + 1) / files.length);
  }
  await fs.promises.writeFile(out, await pdf.save());
}
