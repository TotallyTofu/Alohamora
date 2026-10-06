/** Parse "1-3, 5, 8-" (1-based, inclusive) into groups of 0-based page indexes.
 *  "" → one group with all pages. Throws RangeError with a user-friendly message. */
export function parsePageRanges(input: string, total: number): number[][] {
  const text = input.trim();
  if (text === '') return [Array.from({ length: total }, (_, i) => i)];
  const groups: number[][] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (part === '') continue;
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let from: number;
    let to: number;
    if (m) {
      from = m[1] ? Number(m[1]) : 1;
      to = m[2] ? Number(m[2]) : total;
    } else if (/^\d+$/.test(part)) {
      from = to = Number(part);
    } else {
      throw new RangeError(`"${part}" is not a page range. Use something like 1-3, 5, 8-`);
    }
    if (from < 1 || to < 1) throw new RangeError('Page numbers start at 1');
    if (from > total || to > total) throw new RangeError(`Page ${Math.max(from, to)} doesn't exist (this PDF has ${total} pages)`);
    if (from > to) throw new RangeError(`"${part}" goes backwards`);
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  }
  if (groups.length === 0) throw new RangeError('No pages selected');
  return groups;
}

/** Unique page indexes in first-seen order. */
export function flattenRanges(groups: number[][]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const g of groups) for (const p of g) if (!seen.has(p)) { seen.add(p); out.push(p); }
  return out;
}
