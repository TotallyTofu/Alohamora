import { withDefaults, type PdfWordOptions } from '@shared/toolOptions';
import { convertPdf } from '../../converters/pdf';
import type { ToolRunFn } from '../index';

export const runPdfWord: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfWordOptions>('pdf.word', options);
  await convertPdf(file, 'docx', { docMode: o.mode, ocr: o.ocr }, ctx);
};
