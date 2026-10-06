import { withDefaults, type CreatePdfOptions } from '@shared/toolOptions';
import { imagesToPdf } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';
import { orderFiles } from '../video/join';

export const runImagePdf: ToolRunFn = async (files, options, ctx) => {
  const o = withDefaults<CreatePdfOptions>('image.pdf', options);
  const ordered = orderFiles(files, o.order);
  const layout = { pageSize: o.pageSize, margin: o.margin };
  if (o.combine) {
    await imagesToPdf(ordered, layout, ctx.newOutput({ source: ordered[0].path, ext: 'pdf' }), (p) => ctx.progress(p), ctx.signal);
    ctx.note(`${ordered.length} page${ordered.length === 1 ? '' : 's'}`);
    return;
  }
  for (let i = 0; i < ordered.length; i++) {
    await imagesToPdf([ordered[i]], layout, ctx.newOutput({ source: ordered[i].path, ext: 'pdf' }), (p) => ctx.progress((i + p) / ordered.length), ctx.signal);
  }
  ctx.note(`${ordered.length} PDFs`);
};
