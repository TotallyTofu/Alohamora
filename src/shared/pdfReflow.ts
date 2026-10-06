export interface TextItem { str: string; x: number; y: number; w: number; h: number; fontSize: number; bold: boolean; italic: boolean }
export interface TextPage { width: number; height: number; items: TextItem[] }
export interface Run { text: string; bold: boolean; italic: boolean }
export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'li'; runs: Run[] }
  | { type: 'pagebreak' };

export interface Line { y: number; x: number; right: number; fontSize: number; runs: Run[]; text: string; bold: boolean }

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const runsText = (runs: Run[]): string => runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();

export function totalChars(pages: TextPage[]): number {
  return pages.reduce((n, p) => n + p.items.reduce((k, i) => k + i.str.trim().length, 0), 0);
}

/** A PDF with almost no text per page is probably scanned images. */
export function isScanned(pages: TextPage[]): boolean {
  return pages.length > 0 && totalChars(pages) < 25 * pages.length;
}

export function groupLines(page: TextPage): Line[] {
  const items = page.items.filter((i) => i.str.length > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let rowY = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.y - rowY) <= Math.max(1.5, it.fontSize * 0.5)) row.push(it);
    else { rows.push([it]); rowY = it.y; }
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const runs: Run[] = [];
    let text = '';
    let prevRight: number | null = null;
    for (const it of row) {
      let s = it.str;
      if (prevRight !== null && it.x - prevRight > it.fontSize * 0.2 && !text.endsWith(' ') && !s.startsWith(' ')) s = ` ${s}`;
      text += s;
      prevRight = it.x + it.w;
      const last = runs[runs.length - 1];
      if (last && last.bold === it.bold && last.italic === it.italic) last.text += s;
      else runs.push({ text: s, bold: it.bold, italic: it.italic });
    }
    return {
      y: row[0].y, x: row[0].x, right: prevRight ?? row[0].x, fontSize: median(row.map((i) => i.fontSize)),
      runs, text: text.replace(/\s+/g, ' ').trim(), bold: runs.every((r) => r.bold || r.text.trim() === '')
    };
  }).filter((l) => l.text.length > 0);
}

const EDGE = 0.08;
const PAGE_NO = /^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i;

/** Drop page numbers and lines repeated in the top/bottom 8% of most pages (headers/footers). */
export function removeRepeatedEdges(pages: Line[][], heights: number[]): Line[][] {
  const isEdge = (l: Line, h: number): boolean => l.y < h * EDGE || l.y > h * (1 - EDGE);
  const key = (l: Line): string => l.text.replace(/\d+/g, '#').toLowerCase();
  const counts = new Map<string, number>();
  pages.forEach((lines, p) => {
    const seen = new Set<string>();
    for (const l of lines) {
      if (!isEdge(l, heights[p])) continue;
      const k = key(l);
      if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) ?? 0) + 1); }
    }
  });
  const threshold = Math.max(2, Math.ceil(pages.length * 0.5));
  return pages.map((lines, p) => lines.filter((l) => {
    if (!isEdge(l, heights[p])) return true;
    if (PAGE_NO.test(l.text)) return false;
    return (counts.get(key(l)) ?? 0) < threshold;
  }));
}

function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.fontSize * 2) / 2;
    weight.set(s, (weight.get(s) ?? 0) + l.text.length);
  }
  let best = 12;
  let bestW = -1;
  for (const [s, w] of weight) if (w > bestW) { best = s; bestW = w; }
  return best;
}

const BULLET = /^(?:[•◦▪‣∙●○■□–-]|\*|\d{1,3}[.)]|[a-z][.)])\s+/i;
const ENDS_SENTENCE = /[.!?:]["”')]?$/;

export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic) last.text += r.text;
    else out.push({ ...r });
  }
  return out.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') })).filter((r) => r.text.length > 0);
}

/** Turn positioned text into headings / paragraphs / list items. */
export function reflowPages(pages: TextPage[], opts: { pageBreaks?: boolean } = {}): Block[] {
  const cleaned = removeRepeatedEdges(pages.map(groupLines), pages.map((p) => p.height));
  const all = cleaned.flat();
  if (all.length === 0) return [];
  const body = bodySize(all);
  const blocks: Block[] = [];
  let cur: { type: 'p' | 'li'; runs: Run[]; last: Line } | null = null;
  const flush = (): void => {
    if (cur) blocks.push({ type: cur.type, runs: mergeRuns(cur.runs) });
    cur = null;
  };

  cleaned.forEach((lines, pi) => {
    if (opts.pageBreaks && pi > 0) { flush(); blocks.push({ type: 'pagebreak' }); }
    const gaps: number[] = [];
    for (let i = 1; i < lines.length; i++) { const g = lines[i].y - lines[i - 1].y; if (g > 0) gaps.push(g); }
    const normalGap = median(gaps) || body * 1.3;
    const pageRight = Math.max(0, ...lines.map((l) => l.right));

    lines.forEach((line, li) => {
      const ratio = line.fontSize / body;
      const short = line.text.length < 160;
      const level: 'h1' | 'h2' | 'h3' | null = !short ? null
        : ratio >= 1.8 ? 'h1'
        : ratio >= 1.4 ? 'h2'
        : ratio >= 1.15 || (line.bold && line.text.length < 90 && !/[.,;:]$/.test(line.text)) ? 'h3'
        : null;
      if (level) {
        flush();
        const prevBlock = blocks[blocks.length - 1];
        const continues = li > 0 && prevBlock && prevBlock.type === level && line.y - lines[li - 1].y <= normalGap * 1.6;
        if (continues && prevBlock && 'runs' in prevBlock) prevBlock.runs.push({ text: ' ', bold: false, italic: false }, ...line.runs);
        else blocks.push({ type: level, runs: [...line.runs] });
        return;
      }
      const bullet = BULLET.exec(line.text);
      const prev = li > 0 ? lines[li - 1] : null;
      const active = cur as { type: 'p' | 'li'; runs: Run[]; last: Line } | null;
      const bigGap = prev ? line.y - prev.y > normalGap * 1.45 : active ? ENDS_SENTENCE.test(active.last.text) : true;
      const prevEnded = active !== null && ENDS_SENTENCE.test(active.last.text) && active.last.right < pageRight * 0.85;
      if (!active || bigGap || bullet || prevEnded) {
        flush();
        const runs = bullet ? line.runs.map((r, i) => (i === 0 ? { ...r, text: r.text.trimStart().replace(BULLET, '') } : r)) : [...line.runs];
        cur = { type: bullet ? 'li' : 'p', runs, last: line };
      } else {
        const lastRun = active.runs[active.runs.length - 1];
        if (lastRun && /\p{L}-$/u.test(lastRun.text) && /^\p{Ll}/u.test(line.text)) lastRun.text = lastRun.text.slice(0, -1);
        else active.runs.push({ text: ' ', bold: false, italic: false });
        active.runs.push(...line.runs);
        active.last = line;
      }
    });
  });
  flush();
  return blocks;
}

export function blocksToText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') continue;
    parts.push(b.type === 'li' ? `• ${runsText(b.runs)}` : runsText(b.runs));
  }
  return parts.join('\n\n') + '\n';
}

/** Plain text (e.g. OCR output) → paragraph blocks. */
export function textToBlocks(text: string): Block[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
    .map((t) => ({ type: 'p' as const, runs: [{ text: t, bold: false, italic: false }] }));
}
