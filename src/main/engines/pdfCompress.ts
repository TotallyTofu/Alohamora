import { PDFArray, PDFName, PDFNumber, PDFRawStream, type PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { throwIfAborted } from '../errors';

const LEVELS = { light: { maxSide: 3000, quality: 82 }, balanced: { maxSide: 2000, quality: 70 }, strong: { maxSide: 1400, quality: 55 } } as const;

/** Re-encode embedded JPEG (DCT) images smaller. Returns how many images changed. CMYK and odd images are left alone. */
export async function recompressPdfImages(doc: PDFDocument, level: keyof typeof LEVELS, onProgress: (f: number) => void, signal: AbortSignal): Promise<number> {
  const { maxSide, quality } = LEVELS[level];
  const objs = doc.context.enumerateIndirectObjects();
  let changed = 0;
  for (let k = 0; k < objs.length; k++) {
    throwIfAborted(signal);
    const [ref, obj] = objs[k];
    onProgress(k / objs.length);
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const filter = dict.get(PDFName.of('Filter'));
    const isDct = filter === PDFName.of('DCTDecode') || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === PDFName.of('DCTDecode'));
    if (!isDct || dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceCMYK') || dict.get(PDFName.of('Decode'))) continue;
    try {
      const input = Buffer.from(obj.contents);
      if ((await sharp(input).metadata()).space === 'cmyk') continue;
      const out = await sharp(input).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      if (out.data.length >= input.length * 0.9) continue;
      const nd = dict.clone(doc.context);
      nd.set(PDFName.of('Width'), PDFNumber.of(out.info.width));
      nd.set(PDFName.of('Height'), PDFNumber.of(out.info.height));
      nd.set(PDFName.of('ColorSpace'), PDFName.of(out.info.channels === 1 ? 'DeviceGray' : 'DeviceRGB'));
      nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      nd.delete(PDFName.of('DecodeParms'));
      nd.set(PDFName.of('Length'), PDFNumber.of(out.data.length));
      doc.context.assign(ref, PDFRawStream.of(nd, out.data));
      changed++;
    } catch {
      /* image sharp cannot read → leave untouched */
    }
  }
  return changed;
}
