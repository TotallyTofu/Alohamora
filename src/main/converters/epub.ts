import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cssPageSize, readerCss } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { throwIfAborted, UserError } from '../errors';
import { extractEpub, readViewport } from '../engines/epubReader';
import { htmlFileToPdf } from '../engines/print';
import type { JobContext } from '../jobs/context';

export async function convertEpub(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  if (target !== 'pdf') throw new UserError('EPUB can only be converted to PDF.');
  const book = await extractEpub(file.path, ctx.tempPath('epub'));
  if (book.spine.length === 0) throw new UserError('This EPUB has no readable chapters.');
  const merged = await PDFDocument.create();
  for (let i = 0; i < book.spine.length; i++) {
    throwIfAborted(ctx.signal);
    const chapter = book.spine[i];
    let bytes: Buffer;
    if (book.fixedLayout) {
      const vp = readViewport(chapter);
      bytes = await htmlFileToPdf(chapter, {
        pageSize: vp ? { width: vp.width / 96, height: vp.height / 96 } : 'A4', zeroMargins: true,
        css: 'html,body{margin:0!important;padding:0!important}'
      });
    } else if ((opts.docMode ?? 'reflow') === 'reflow') {
      bytes = await htmlFileToPdf(chapter, { css: readerCss({ textSize: opts.textSize, font: opts.font, pageSize: opts.pageSize }) });
    } else {
      bytes = await htmlFileToPdf(chapter, { css: `@page { size: ${cssPageSize(opts.pageSize ?? 'a4')}; margin: 16mm; }` });
    }
    const src = await PDFDocument.load(bytes);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
    ctx.progress((i + 1) / book.spine.length);
  }
  merged.setTitle(book.title);
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf' }), await merged.save());
}
