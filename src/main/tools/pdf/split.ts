import fs from 'node:fs';
import { splitGroups } from '@shared/pdfSplit';
import { withDefaults, type PdfSplitOptions } from '@shared/toolOptions';
import { throwIfAborted, UserError } from '../../errors';
import { extractPages, loadPdf } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';

export const runPdfSplit: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfSplitOptions>('pdf.split', options);
  const src = await loadPdf(file.path);
  let groups: number[][];
  try {
    groups = splitGroups(o, src.getPageCount());
  } catch (e) {
    if (e instanceof RangeError) throw new UserError(e.message);
    throw e;
  }
  for (let i = 0; i < groups.length; i++) {
    throwIfAborted(ctx.signal);
    const bytes = await extractPages(src, groups[i]);
    const spec = groups.length > 1
      ? { source: file.path, ext: 'pdf', group: 'part', index: i + 1, total: groups.length }
      : { source: file.path, ext: 'pdf', suffix: o.mode === 'every' ? 'part' : 'extract' };
    await fs.promises.writeFile(ctx.newOutput(spec), bytes);
    ctx.progress((i + 1) / groups.length);
  }
  ctx.note(`${groups.length} file${groups.length === 1 ? '' : 's'}`);
};
