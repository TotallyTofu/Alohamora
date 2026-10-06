import { flattenRanges, parsePageRanges } from './pageRanges';
import type { PdfSplitOptions } from './toolOptions';

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Page groups (0-based) for a split request. Throws RangeError with a user-friendly message for bad input. */
export function splitGroups(o: PdfSplitOptions, total: number): number[][] {
  if (o.mode === 'each') return range(0, total).map((i) => [i]);
  if (o.mode === 'every') {
    const n = Math.max(1, Math.round(o.every));
    const groups: number[][] = [];
    for (let i = 0; i < total; i += n) groups.push(range(i, Math.min(total, i + n)));
    return groups;
  }
  if (o.ranges.trim() === '') throw new RangeError('Enter the pages to use, for example 1-3, 5');
  const parsed = parsePageRanges(o.ranges, total);
  return o.mode === 'ranges' ? parsed : [flattenRanges(parsed)];
}
