import fs from 'node:fs';
import { withDefaults, type PdfOrganizeOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { loadPdf, organizePdf } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';

export const runPdfOrganize: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfOrganizeOptions>('pdf.organize', options);
  if (o.pages.length === 0) throw new UserError('Nothing changed');
  const src = await loadPdf(file.path);
  const total = src.getPageCount();
  if (o.pages.some((p) => !Number.isInteger(p.src) || p.src < 0 || p.src >= total)) throw new UserError('A page in the list does not exist.');
  const bytes = await organizePdf(src, o.pages.map((p) => ({ src: p.src, rotate: p.rotate })));
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf', suffix: 'organized' }), bytes);
  ctx.note(`${o.pages.length} of ${total} pages kept`);
};
