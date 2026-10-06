import fs from 'node:fs';
import { formatBytes } from '@shared/time';
import { withDefaults, type PdfCompressOptions } from '@shared/toolOptions';
import { throwIfAborted } from '../../errors';
import { recompressPdfImages } from '../../engines/pdfCompress';
import { pdfRenderPage, withPdf } from '../../engines/pdfEngine';
import { loadPdf, pageImagesToPdf } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';

export const runPdfCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfCompressOptions>('pdf.compress', options);
  const out = ctx.newOutput({ source: file.path, ext: 'pdf', suffix: 'compressed' });

  if (o.level === 'max') {
    const pages = await withPdf(file.path, async (doc) => {
      const list: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }> = [];
      for (let i = 0; i < doc.pages; i++) {
        throwIfAborted(ctx.signal);
        list.push({ jpeg: await pdfRenderPage(doc.id, i, { dpi: 110, mime: 'image/jpeg', quality: 0.6 }), widthPt: doc.sizes[i].width, heightPt: doc.sizes[i].height });
        ctx.progress((i + 1) / doc.pages);
      }
      return list;
    });
    await fs.promises.writeFile(out, await pageImagesToPdf(pages));
    ctx.note('Pages were converted to images (text is no longer selectable)');
    return;
  }

  const doc = await loadPdf(file.path);
  await recompressPdfImages(doc, o.level, (p) => ctx.progress(p * 0.9), ctx.signal);
  const bytes = await doc.save({ useObjectStreams: true });
  if (bytes.length >= file.size * 0.98) {
    ctx.dropOutput(out);
    ctx.note('Already optimized — no smaller file was made');
    return;
  }
  await fs.promises.writeFile(out, bytes);
  ctx.note(`${formatBytes(file.size)} → ${formatBytes(bytes.length)} (−${Math.round((1 - bytes.length / file.size) * 100)}%)`);
};
