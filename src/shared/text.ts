/** Decode text bytes: UTF-8 (with/without BOM), UTF-16 LE/BE with BOM. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const escapeHtml = escapeXml;

export type TextFont = 'mono' | 'serif' | 'sans' | 'original';

/** Font stacks covering Windows, macOS and Linux (all include Vietnamese glyphs). */
export function fontStack(font: TextFont): string {
  if (font === 'mono') return "'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', monospace";
  if (font === 'serif') return "Georgia, 'Times New Roman', 'Noto Serif', 'DejaVu Serif', 'Liberation Serif', serif";
  return "'Segoe UI', -apple-system, 'Helvetica Neue', 'Noto Sans', 'DejaVu Sans', Ubuntu, Cantarell, Arial, sans-serif";
}

export const TEXT_SIZE_PT: Record<'small' | 'medium' | 'large' | 'xlarge', number> = { small: 9.5, medium: 11, large: 13, xlarge: 16 };

export function cssPageSize(size: 'a4' | 'letter' | 'a5'): string {
  return size === 'letter' ? 'letter' : size === 'a5' ? 'A5' : 'A4';
}

/** Plain text → printable HTML document (used by TXT → PDF/JPG/PNG). */
export function textToHtml(text: string, o: { title: string; font: TextFont; sizePt: number; pageSize: 'a4' | 'letter' | 'a5' }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.title)}</title><style>
@page { size: ${cssPageSize(o.pageSize)}; margin: 18mm 16mm; }
html, body { margin: 0; background: #fff; }
body { font-family: ${fontStack(o.font)}; font-size: ${o.sizePt}pt; line-height: 1.45; color: #111; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; }
</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
}

/** Rough language guess for EPUB metadata. */
export function guessLang(text: string): string {
  return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text) ? 'vi' : 'en';
}
