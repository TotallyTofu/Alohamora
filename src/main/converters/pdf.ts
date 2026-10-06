import fs from 'node:fs';
import { blocksToText, isScanned, reflowPages, type Block } from '@shared/pdfReflow';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { throwIfAborted, UserError } from '../errors';
import { pdfExtractText, pdfRenderPage, withPdf } from '../engines/pdfEngine';
import type { JobContext } from '../jobs/context';

/** Render pages of `pdfPath` to images. `source` decides output naming. One page → single file; more → "<base>-pages/" folder. */
export async function pdfToImages(
  pdfPath: string, source: string, fmt: 'jpg' | 'png', dpi: number, quality: number, ctx: JobContext, pageIndexes?: number[]
): Promise<void> {
  await withPdf(pdfPath, async (doc) => {
    const pages = pageIndexes ?? Array.from({ length: doc.pages }, (_, i) => i);
    for (let k = 0; k < pages.length; k++) {
      throwIfAborted(ctx.signal);
      const buf = await pdfRenderPage(doc.id, pages[k], { dpi, mime: fmt === 'png' ? 'image/png' : 'image/jpeg', quality });
      const out = pages.length === 1
        ? ctx.newOutput({ source, ext: fmt })
        : ctx.newOutput({ source, ext: fmt, group: 'pages', index: pages[k] + 1, total: doc.pages });
      await fs.promises.writeFile(out, buf);
      ctx.progress((k + 1) / pages.length);
    }
  });
}

async function pdfToBlocks(file: FileInfo, opts: ConvertOptions, ctx: JobContext): Promise<Block[]> {
  const pages = await withPdf(file.path, (doc) => pdfExtractText(doc.id));
  if (isScanned(pages)) {
    if (opts.ocr === 'off') throw new UserError('This PDF has no text layer (it looks scanned). Turn on OCR to extract the text.');
    throw new UserError('OCR is not available yet.');       // replaced by ocrPdfToBlocks in Task 6.12
  }
  return reflowPages(pages);
}

export async function convertPdf(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  switch (target) {
    case 'jpg':
    case 'png':
      return pdfToImages(file.path, file.path, target, ctx.settings.pdfDpi, 0.9, ctx);
    case 'txt': {
      const blocks = await pdfToBlocks(file, opts, ctx);
      await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'txt' }), blocksToText(blocks), 'utf8');
      return;
    }
    default:
      throw new UserError(`Converting PDF to ${target.toUpperCase()} is not available yet.`);
  }
}
