import fs from 'node:fs';
import { blocksToText, blocksToXhtml, isScanned, reflowPages, splitChapters, type Block } from '@shared/pdfReflow';
import { guessLang } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { throwIfAborted, UserError } from '../errors';
import { blocksToDocx, pageImagesToDocx } from '../engines/docxWriter';
import { buildFixedEpub, buildReflowEpub } from '../engines/epubWriter';
import { ocrPdfToBlocks } from '../engines/ocr';
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
    return ocrPdfToBlocks(file.path, ctx);
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
    case 'docx': {
      const out = ctx.newOutput({ source: file.path, ext: 'docx' });
      if ((opts.docMode ?? 'reflow') === 'pages') {
        const pages = await withPdf(file.path, async (doc) => {
          const list: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }> = [];
          for (let i = 0; i < doc.pages; i++) {
            throwIfAborted(ctx.signal);
            list.push({ jpeg: await pdfRenderPage(doc.id, i, { dpi: 200, mime: 'image/jpeg', quality: 0.85 }), widthPt: doc.sizes[i].width, heightPt: doc.sizes[i].height });
            ctx.progress((i + 1) / doc.pages);
          }
          return list;
        });
        await fs.promises.writeFile(out, await pageImagesToDocx(pages));
      } else {
        await fs.promises.writeFile(out, await blocksToDocx(await pdfToBlocks(file, opts, ctx), file.base));
      }
      return;
    }
    case 'epub': {
      const out = ctx.newOutput({ source: file.path, ext: 'epub' });
      const meta = { title: file.base, lang: 'en' };
      if ((opts.docMode ?? 'reflow') === 'pages') {
        const pages = await withPdf(file.path, async (doc) => {
          const list: Array<{ jpeg: Buffer; width: number; height: number }> = [];
          for (let i = 0; i < doc.pages; i++) {
            throwIfAborted(ctx.signal);
            const jpeg = await pdfRenderPage(doc.id, i, { dpi: 150, mime: 'image/jpeg', quality: 0.85 });
            list.push({ jpeg, width: Math.round((doc.sizes[i].width * 150) / 72), height: Math.round((doc.sizes[i].height * 150) / 72) });
            ctx.progress((i + 1) / doc.pages);
          }
          return list;
        });
        await fs.promises.writeFile(out, await buildFixedEpub(meta, pages));
      } else {
        const blocks = await pdfToBlocks(file, opts, ctx);
        meta.lang = guessLang(blocksToText(blocks));
        const chapters = splitChapters(blocks, file.base).map((c) => ({ title: c.title, bodyXhtml: blocksToXhtml(c.blocks) }));
        await fs.promises.writeFile(out, await buildReflowEpub(meta, chapters));
      }
      return;
    }
    default:
      throw new UserError(`Converting PDF to ${target.toUpperCase()} is not available yet.`);
  }
}
