import fs from 'node:fs';
import type { TextPage } from '@shared/pdfReflow';
import { UserError } from '../errors';
import { callEngine } from '../windows/engineWindow';

export interface PdfDocHandle { id: string; pages: number; sizes: Array<{ width: number; height: number }> }

export async function pdfOpen(filePath: string): Promise<PdfDocHandle> {
  const data = new Uint8Array(await fs.promises.readFile(filePath));
  try {
    return await callEngine<PdfDocHandle>('pdf.open', { data });
  } catch (e) {
    const msg = (e as Error).message;
    if (/password/i.test(msg)) throw new UserError('This PDF is password-protected. Remove the password first, then try again.');
    throw new UserError('This PDF could not be opened. It may be damaged.', msg);
  }
}

export async function pdfClose(id: string): Promise<void> {
  await callEngine('pdf.close', { id }).catch(() => undefined);
}

export async function withPdf<T>(filePath: string, fn: (doc: PdfDocHandle) => Promise<T>): Promise<T> {
  const doc = await pdfOpen(filePath);
  try { return await fn(doc); } finally { await pdfClose(doc.id); }
}

export async function pdfRenderPage(id: string, pageIndex: number, o: { dpi: number; mime: 'image/png' | 'image/jpeg'; quality?: number }): Promise<Buffer> {
  const u8 = await callEngine<Uint8Array>('pdf.renderPage', { id, pageIndex, ...o });
  return Buffer.from(u8);
}

export const pdfThumbs = (id: string, maxWidth: number, maxPages?: number): Promise<string[]> =>
  callEngine<string[]>('pdf.thumbnails', { id, maxWidth, maxPages }, 600_000);

export const pdfExtractText = (id: string): Promise<TextPage[]> => callEngine<TextPage[]>('pdf.extractText', { id }, 600_000);
