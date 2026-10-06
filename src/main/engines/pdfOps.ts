import fs from 'node:fs';
import { degrees, PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { throwIfAborted, UserError } from '../errors';
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

export async function loadPdf(filePath: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await fs.promises.readFile(filePath), { updateMetadata: false });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'EncryptedPDFError' || /encrypt/i.test(err.message)) throw new UserError('This PDF is password-protected. Remove the password first, then try again.');
    throw new UserError('This PDF could not be opened. It may be damaged.', err.message);
  }
}

export async function extractPages(src: PDFDocument, indexes: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of await doc.copyPages(src, indexes)) doc.addPage(p);
  return doc.save({ useObjectStreams: true });
}

export async function mergePdfs(paths: string[], onProgress: (f: number) => void): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (let i = 0; i < paths.length; i++) {
    const src = await loadPdf(paths[i]);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
    onProgress((i + 1) / paths.length);
  }
  return merged.save({ useObjectStreams: true });
}

export async function organizePdf(src: PDFDocument, pages: Array<{ src: number; rotate: number }>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, pages.map((p) => p.src));
  copied.forEach((pg, i) => {
    pg.setRotation(degrees((pg.getRotation().angle + pages[i].rotate) % 360));
    doc.addPage(pg);
  });
  return doc.save({ useObjectStreams: true });
}

/** Each page is drawn from a JPEG at [widthPt, heightPt] (used by "Max" compression). */
export async function pageImagesToPdf(pages: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const img = await doc.embedJpg(p.jpeg);
    doc.addPage([p.widthPt, p.heightPt]).drawImage(img, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
  }
  return doc.save({ useObjectStreams: true });
}
