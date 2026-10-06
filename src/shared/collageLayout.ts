export interface Cell { x: number; y: number; w: number; h: number }
export type CollageLayout = 'grid' | 'row' | 'column' | 'featured';

export function collageCells(n: number, layout: CollageLayout, width: number, gap: number): { width: number; height: number; cells: Cell[] } {
  const W = Math.round(width);
  const idx = Array.from({ length: n }, (_, i) => i);
  if (layout === 'row') {
    const cw = (W - gap * (n + 1)) / n;
    return { width: W, height: Math.round(cw + 2 * gap), cells: idx.map((i) => ({ x: gap + i * (cw + gap), y: gap, w: cw, h: cw })) };
  }
  if (layout === 'column') {
    const cw = W - 2 * gap;
    const ch = cw * 0.75;
    return { width: W, height: Math.round(n * ch + (n + 1) * gap), cells: idx.map((i) => ({ x: gap, y: gap + i * (ch + gap), w: cw, h: ch })) };
  }
  if (layout === 'featured' && n >= 2) {
    const bigW = (W - 3 * gap) * (2 / 3);
    const smallW = W - 3 * gap - bigW;
    const H = Math.round(bigW * 0.75 + 2 * gap);
    const rest = n - 1;
    const sh = (H - (rest + 1) * gap) / rest;
    return {
      width: W, height: H,
      cells: [{ x: gap, y: gap, w: bigW, h: H - 2 * gap }, ...idx.slice(1).map((i) => ({ x: 2 * gap + bigW, y: gap + (i - 1) * (sh + gap), w: smallW, h: sh }))]
    };
  }
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cw = (W - gap * (cols + 1)) / cols;
  return {
    width: W, height: Math.round(rows * cw + (rows + 1) * gap),
    cells: idx.map((i) => ({ x: gap + (i % cols) * (cw + gap), y: gap + Math.floor(i / cols) * (cw + gap), w: cw, h: cw }))
  };
}
