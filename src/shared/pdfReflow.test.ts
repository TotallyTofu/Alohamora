import { describe, expect, it } from 'vitest';
import {
  blocksToText, blocksToXhtml, isScanned, reflowPages, runsText, splitChapters, textToBlocks,
  type Block, type TextItem, type TextPage
} from './pdfReflow';

/** A text item whose width is roughly 0.5 em per character. */
function item(str: string, x: number, y: number, size = 12, bold = false): TextItem {
  return { str, x, y, w: str.length * size * 0.5, h: size, fontSize: size, bold, italic: false };
}

const page = (items: TextItem[], height = 800): TextPage => ({ width: 600, height, items });
const textOf = (b: Block): string => (b.type === 'pagebreak' ? '' : runsText(b.runs));

describe('reflowPages', () => {
  it('detects a title, paragraphs and a bullet; drops the page number', () => {
    const blocks = reflowPages([page([
      item('Kabooks Test Document', 72, 80, 24, true),
      item('Body text on the first line of the paragraph and', 72, 120),
      item('continues here and then ends.', 72, 135),
      item('A second paragraph starts here and is long enough to be the widest line on this page.', 72, 180),
      item('• item one', 72, 220),
      item('1', 300, 780, 10)
    ])]);
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'p', 'p', 'li']);
    expect(blocks.some((b) => textOf(b) === '1')).toBe(false);
    expect(textOf(blocks[1])).toContain('first line of the paragraph and continues here and then ends.');
    expect(textOf(blocks[3])).toBe('item one');
  });

  it('removes a header repeated on most pages', () => {
    const pages = [1, 2, 3].map((n) => page([
      item(`Body text for page ${n} that is long enough to count as content.`, 72, 200),
      item('Confidential', 72, 790)
    ]));
    const text = blocksToText(reflowPages(pages));
    expect(text).not.toContain('Confidential');
    expect(text).toContain('Body text for page 2');
  });

  it('joins a hyphenated word across lines', () => {
    const blocks = reflowPages([page([
      item('Some words and infor-', 72, 100),
      item('mation continues on the next line', 72, 114)
    ])]);
    expect(blocks).toHaveLength(1);
    expect(textOf(blocks[0])).toContain('information continues');
  });

  it('inserts page breaks only when asked', () => {
    const pages = [page([item('First page text goes here.', 72, 200)]), page([item('Second page text goes here.', 72, 200)])];
    expect(reflowPages(pages).some((b) => b.type === 'pagebreak')).toBe(false);
    expect(reflowPages(pages, { pageBreaks: true }).some((b) => b.type === 'pagebreak')).toBe(true);
  });

  it('returns nothing for empty pages', () => {
    expect(reflowPages([page([])])).toEqual([]);
  });
});

describe('isScanned / textToBlocks / blocksToText', () => {
  it('flags pages with almost no text', () => {
    expect(isScanned([page([])])).toBe(true);
    expect(isScanned([])).toBe(false);
    expect(isScanned([page([item('x'.repeat(200), 72, 100)])])).toBe(false);
  });

  it('textToBlocks splits on blank lines and unwraps hard line breaks', () => {
    const blocks = textToBlocks('First line\nsecond line\n\nNext paragraph');
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toBe('First line second line');
  });

  it('blocksToText bullets list items and skips page breaks', () => {
    const text = blocksToText([
      { type: 'h1', runs: [{ text: 'Title', bold: true, italic: false }] },
      { type: 'pagebreak' },
      { type: 'li', runs: [{ text: 'one', bold: false, italic: false }] }
    ]);
    expect(text).toBe('Title\n\n• one\n');
  });
});

describe('blocksToXhtml / splitChapters', () => {
  const run = (text: string, bold = false) => ({ text, bold, italic: false });

  it('wraps consecutive list items in one <ul> and escapes markup', () => {
    const xhtml = blocksToXhtml([
      { type: 'p', runs: [run('a < b & c')] },
      { type: 'li', runs: [run('one')] },
      { type: 'li', runs: [run('two', true)] },
      { type: 'p', runs: [run('after')] }
    ]);
    expect(xhtml.match(/<ul>/g)).toHaveLength(1);
    expect(xhtml).toContain('a &lt; b &amp; c');
    expect(xhtml).toContain('<li><strong>two</strong></li>');
    expect(xhtml.indexOf('</ul>')).toBeLessThan(xhtml.indexOf('after'));
  });

  it('starts a new chapter at every h1', () => {
    const chapters = splitChapters([
      { type: 'h1', runs: [run('One')] }, { type: 'p', runs: [run('x')] },
      { type: 'h1', runs: [run('Two')] }, { type: 'p', runs: [run('y')] }
    ], 'Book');
    expect(chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(chapters[0].blocks).toHaveLength(2);
  });

  it('uses the fallback title when the text starts without a heading, and cuts very long chapters', () => {
    const many: Block[] = Array.from({ length: 650 }, () => ({ type: 'p', runs: [run('x')] }));
    const chapters = splitChapters(many, 'Book');
    expect(chapters[0].title).toBe('Book');
    expect(chapters).toHaveLength(3);
    expect(chapters[1].title).toBe('Book (cont.)');
  });
});
