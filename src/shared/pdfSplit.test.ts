import { describe, expect, it } from 'vitest';
import { splitGroups } from './pdfSplit';
import type { PdfSplitOptions } from './toolOptions';

const opts = (over: Partial<PdfSplitOptions>): PdfSplitOptions => ({ mode: 'each', every: 1, ranges: '', ...over });

describe('splitGroups', () => {
  it('each page on its own', () => {
    expect(splitGroups(opts({ mode: 'each' }), 3)).toEqual([[0], [1], [2]]);
  });

  it('every N pages (last chunk may be shorter)', () => {
    expect(splitGroups(opts({ mode: 'every', every: 2 }), 5)).toEqual([[0, 1], [2, 3], [4]]);
    expect(splitGroups(opts({ mode: 'every', every: 0 }), 2)).toEqual([[0], [1]]);
  });

  it('custom ranges keep their grouping', () => {
    expect(splitGroups(opts({ mode: 'ranges', ranges: '1-2,3' }), 3)).toEqual([[0, 1], [2]]);
  });

  it('extract merges everything into one group without duplicates', () => {
    expect(splitGroups(opts({ mode: 'extract', ranges: '2, 1-2' }), 3)).toEqual([[1, 0]]);
  });

  it('bad input gives friendly RangeErrors', () => {
    expect(() => splitGroups(opts({ mode: 'ranges', ranges: '9' }), 3)).toThrow(/doesn't exist/);
    expect(() => splitGroups(opts({ mode: 'extract', ranges: '  ' }), 3)).toThrow(/Enter the pages/);
  });
});
