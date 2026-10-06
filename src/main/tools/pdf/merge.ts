import fs from 'node:fs';
import { withDefaults, type PdfMergeOptions } from '@shared/toolOptions';
import { mergePdfs } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';
import { orderFiles } from '../video/join';

export const runPdfMerge: ToolRunFn = async (files, options, ctx) => {
  const o = withDefaults<PdfMergeOptions>('pdf.merge', options);
  const ordered = orderFiles(files, o.order);
  const bytes = await mergePdfs(ordered.map((f) => f.path), (p) => ctx.progress(p));
  await fs.promises.writeFile(ctx.newOutput({ source: ordered[0].path, ext: 'pdf', suffix: 'merged' }), bytes);
  const pages = ordered.reduce((n, f) => n + (f.pages ?? 0), 0);
  ctx.note(pages ? `${pages} pages` : `${ordered.length} PDFs merged`);
};
