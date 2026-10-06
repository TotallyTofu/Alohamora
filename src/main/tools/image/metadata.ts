import exifr from 'exifr';
import fs from 'node:fs';
import sharp from 'sharp';
import { withDefaults, type ImageMetadataOptions } from '@shared/toolOptions';
import type { FileInfo } from '@shared/types';
import { loadImage, saveImageAs, sameImageFmt } from '../../engines/image';
import { stripJpegMetadata, stripPngMetadata } from '../../engines/imageMeta';
import { jpegEditFields, jpegRemoveGps } from '../../engines/imageMetaEdit';
import type { ToolRunFn } from '../index';

interface Fields { artist?: string; copyright?: string; description?: string; dateTaken?: string }

/** "2024-05-01T14:30" (datetime-local) → "2024:05:01 14:30:00" (EXIF). Anything else is returned unchanged. */
export function toExifDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
  return m ? `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6] ?? '00'}` : v;
}

/** JPEG photos with an orientation tag must not be stripped losslessly: dropping the tag would rotate them. */
async function needsReencode(file: FileInfo): Promise<boolean> {
  if (file.fmt !== 'jpg') return false;
  return ((await sharp(file.path).metadata()).orientation ?? 1) !== 1;
}

export const runImageMetadata: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageMetadataOptions>('image.metadata', options);
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  const suffix = o.action === 'remove-all' ? 'clean' : o.action === 'remove-gps' ? 'nogps' : 'meta';
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix });
  const bytes = await fs.promises.readFile(file.path);
  const fields: Fields = { ...o.fields, dateTaken: toExifDate(o.fields.dateTaken) };

  if (o.action === 'remove-all') {
    if (file.fmt === 'jpg' && !(await needsReencode(file))) await fs.promises.writeFile(out, stripJpegMetadata(bytes));
    else if (file.fmt === 'png') await fs.promises.writeFile(out, stripPngMetadata(bytes));
    else await saveImageAs(await loadImage(file), fmt, out, 95, ctx, false);
    ctx.note('Metadata removed');
    return;
  }

  if (file.fmt === 'jpg') {
    await fs.promises.writeFile(out, o.action === 'remove-gps' ? jpegRemoveGps(bytes) : jpegEditFields(bytes, fields));
  } else {
    // Other formats: re-encode, carrying over (or replacing) only the text fields — never the location.
    const old = (await exifr.parse(file.path, { tiff: true, exif: false, gps: false, xmp: false, icc: false, iptc: false }).catch(() => null)) as
      Record<string, unknown> | null;
    const ifd0: Record<string, string> = {};
    const artist = o.action === 'edit' ? fields.artist ?? String(old?.Artist ?? '') : String(old?.Artist ?? '');
    const copyright = o.action === 'edit' ? fields.copyright ?? String(old?.Copyright ?? '') : String(old?.Copyright ?? '');
    const description = o.action === 'edit' ? fields.description ?? String(old?.ImageDescription ?? '') : String(old?.ImageDescription ?? '');
    if (artist) ifd0.Artist = artist;
    if (copyright) ifd0.Copyright = copyright;
    if (description) ifd0.ImageDescription = description;
    const img = (await loadImage(file)).withExif({ IFD0: ifd0 });
    await saveImageAs(img, fmt, out, 95, ctx, false);
  }
  ctx.note(o.action === 'remove-gps' ? 'Location removed' : 'Metadata updated');
};
