import { describe, expect, it } from 'vitest';
import { flattenRanges, parsePageRanges } from './pageRanges';

describe('parsePageRanges', () => {
  it('empty means all pages in one group', () => {
    expect(parsePageRanges('', 3)).toEqual([[0, 1, 2]]);
    expect(parsePageRanges('   ', 2)).toEqual([[0, 1]]);
  });

  it('parses lists, ranges and open ranges', () => {
    expect(parsePageRanges('1-2, 3', 3)).toEqual([[0, 1], [2]]);
    expect(parsePageRanges('2-', 4)).toEqual([[1, 2, 3]]);
    expect(parsePageRanges('-2', 4)).toEqual([[0, 1]]);
  });

  it('throws friendly RangeErrors', () => {
    expect(() => parsePageRanges('5', 3)).toThrow(RangeError);
    expect(() => parsePageRanges('5', 3)).toThrow(/doesn't exist/);
    expect(() => parsePageRanges('x', 3)).toThrow(/not a page range/);
    expect(() => parsePageRanges('3-1', 5)).toThrow(/backwards/);
    expect(() => parsePageRanges('0', 5)).toThrow(/start at 1/);
    expect(() => parsePageRanges(',', 5)).toThrow(/No pages/);
  });
});

describe('flattenRanges', () => {
  it('keeps first-seen order and drops duplicates', () => {
    expect(flattenRanges([[0, 1], [1, 2], [0]])).toEqual([0, 1, 2]);
  });
});
