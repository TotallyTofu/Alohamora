import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { flattenRanges, parsePageRanges } from '@shared/pageRanges';
import { withDefaults, type PdfOcrOptions } from '@shared/toolOptions';
import { ToolError, UserError } from '../../errors';
import { ocrPages } from '../../engines/ocr';
import type { ToolRunFn } from '../index';

export const runPdfOcr: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfOcrOptions>('pdf.ocr', options);
  const wanted = o.languages.filter((l) => ctx.caps.ocrLanguages.includes(l));
  const langs = wanted.length ? wanted : ['eng'];
  let indexes: number[];
  try {
    indexes = flattenRanges(parsePageRanges(o.ranges, file.pages ?? 0));
  } catch (e) {
    if (e instanceof RangeError) throw new UserError(e.message);
    throw e;
  }
  const { text, pdfs } = await ocrPages(file.path, ctx, langs, indexes, o.output === 'pdf');
  if (o.output === 'txt') {
    await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'txt', suffix: 'ocr' }), text, 'utf8');
    return;
  }
  if (pdfs.length !== indexes.length) throw new ToolError('This OCR engine version cannot write PDFs', '');
  const merged = await PDFDocument.create();
  for (const bytes of pdfs) {
    const src = await PDFDocument.load(bytes);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
  }
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf', suffix: 'searchable' }), await merged.save());
};
