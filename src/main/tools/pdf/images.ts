import { flattenRanges, parsePageRanges } from '@shared/pageRanges';
import { withDefaults, type PdfImagesOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { pdfToImages } from '../../converters/pdf';
import type { ToolRunFn } from '../index';

export const runPdfImages: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<PdfImagesOptions>('pdf.images', options);
  let indexes: number[];
  try {
    indexes = flattenRanges(parsePageRanges(o.ranges, file.pages ?? 0));
  } catch (e) {
    if (e instanceof RangeError) throw new UserError(e.message);
    throw e;
  }
  await pdfToImages(file.path, file.path, o.format, o.dpi, o.quality / 100, ctx, indexes);
};
