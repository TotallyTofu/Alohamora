import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { withDefaults, type PdfMetadataOptions } from '@shared/toolOptions';
import { loadPdf } from '../../engines/pdfOps';
import type { ToolRunFn } from '../index';

export const runPdfMetadata: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfMetadataOptions>('pdf.metadata', options);
  const src = await loadPdf(file.path);
  if (o.removeAll) {
    const clean = await PDFDocument.create({ updateMetadata: false });
    for (const p of await clean.copyPages(src, src.getPageIndices())) clean.addPage(p);
    await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf', suffix: 'clean' }), await clean.save({ useObjectStreams: true }));
    ctx.note('Bookmarks and form fields are not kept when removing all metadata.');
    return;
  }
  src.setTitle(o.title);
  src.setAuthor(o.author);
  src.setSubject(o.subject);
  src.setKeywords(o.keywords.split(',').map((k) => k.trim()).filter(Boolean));
  src.setModificationDate(new Date());
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf', suffix: 'meta' }), await src.save({ useObjectStreams: true }));
  ctx.note('Metadata updated');
};
