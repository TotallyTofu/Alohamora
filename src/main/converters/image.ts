import fs from 'node:fs';
import { outputExt } from '@shared/formats';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { loadImage, saveBmp, saveRaster } from '../engines/image';
import { imagesToDocx } from '../engines/docxWriter';
import { encodeHeic } from '../engines/heif';
import { embeddableImage, imagesToPdf } from '../engines/pdfOps';
import { embedAsSvg, traceToSvg } from '../engines/svg';
import type { JobContext } from '../jobs/context';

export async function convertImage(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const quality = opts.quality ?? ctx.settings.imageQuality;
  const img = await loadImage(file);
  ctx.progress(0.2);
  switch (target) {
    case 'jpg': case 'png': case 'webp': case 'avif': case 'tiff':
      await saveRaster(img, target, ctx.newOutput({ source: file.path, ext: outputExt(target) }), quality);
      break;
    case 'bmp':
      await saveBmp(img, ctx.newOutput({ source: file.path, ext: 'bmp' }), ctx.tempPath('bmp-src.png'));
      break;
    case 'svg': {
      const out = ctx.newOutput({ source: file.path, ext: 'svg' });
      if ((opts.svgMode ?? 'trace') === 'embed') await embedAsSvg(img, out);
      else await traceToSvg(img, out, opts.svgColors ?? 16);
      break;
    }
    case 'heic': {
      if (!ctx.caps.heifEnc) throw new UserError('HEIC output is not available on this computer (see the Formats page).');
      await encodeHeic(img, ctx.newOutput({ source: file.path, ext: 'heic' }), quality, ctx.tempPath('heic-src.png'), ctx.signal);
      break;
    }
    case 'pdf':
      await imagesToPdf([file], { pageSize: 'fit', margin: 'none' }, ctx.newOutput({ source: file.path, ext: 'pdf' }), (p) => ctx.progress(p), ctx.signal);
      break;
    case 'docx':
      await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'docx' }), await imagesToDocx([await embeddableImage(file)]));
      break;
    default:
      throw new UserError(`Converting images to ${target.toUpperCase()} is not available yet.`);
  }
  ctx.progress(1);
}
