import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ownBytes } from './bytes';

/** A small JPEG held in a Buffer that does not start at offset 0 of its ArrayBuffer — what Node's Buffer pool produces. */
async function pooledJpeg(): Promise<Buffer> {
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).jpeg({ quality: 60 }).toBuffer();
  const backing = new ArrayBuffer(jpeg.length + 37);
  const view = Buffer.from(backing, 21, jpeg.length);
  jpeg.copy(view);
  return view;
}

describe('ownBytes', () => {
  it('returns the same bytes in an ArrayBuffer of exactly their size', async () => {
    const pooled = await pooledJpeg();
    expect(pooled.byteOffset).toBe(21);                       // the precondition that makes the tests below meaningful
    const own = ownBytes(pooled);
    expect(Buffer.from(own).equals(pooled)).toBe(true);
    expect(own.byteOffset).toBe(0);
    expect(own.buffer.byteLength).toBe(pooled.length);
  });

  it('documents the pdf-lib limitation it works around: a JPEG at a non-zero offset cannot be embedded as-is', async () => {
    const pooled = await pooledJpeg();
    const doc = await PDFDocument.create();
    await expect(doc.embedJpg(pooled)).rejects.toThrow(/SOI not found/);
  });

  it('makes the same JPEG embeddable', async () => {
    const pooled = await pooledJpeg();
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(ownBytes(pooled));
    doc.addPage([200, 100]).drawImage(img, { x: 0, y: 0, width: 200, height: 100 });
    const reloaded = await PDFDocument.load(await doc.save());
    expect(reloaded.getPageCount()).toBe(1);
  });
});
