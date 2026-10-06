import { describe, expect, it } from 'vitest';
import { cssPageSize, decodeText, escapeXml, fontStack, guessLang, textToHtml } from './text';

describe('decodeText', () => {
  it('handles UTF-8 with BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]))).toBe('Hi');
  });

  it('handles UTF-16LE and UTF-16BE with BOM', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe('A');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x42]))).toBe('B');
  });

  it('handles plain UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Tiếng Việt'))).toBe('Tiếng Việt');
  });
});

describe('escapeXml', () => {
  it('escapes the five XML characters', () => {
    expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
    expect(escapeXml("it's")).toBe('it&apos;s');
  });
});

describe('guessLang', () => {
  it('detects Vietnamese', () => {
    expect(guessLang('Xin chào thế giới')).toBe('vi');
    expect(guessLang('Hello world')).toBe('en');
  });
});

describe('textToHtml / fontStack / cssPageSize', () => {
  it('escapes the text and embeds the page size', () => {
    const html = textToHtml('<script>x</script>', { title: 'T & U', font: 'mono', sizePt: 11, pageSize: 'letter' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('size: letter');
    expect(html).toContain('<title>T &amp; U</title>');
  });

  it('font stacks list cross-platform fonts', () => {
    expect(fontStack('mono')).toContain('Menlo');
    expect(fontStack('serif')).toContain('Georgia');
    expect(fontStack('sans')).toContain('Segoe UI');
    expect(cssPageSize('a5')).toBe('A5');
    expect(cssPageSize('a4')).toBe('A4');
  });
});
