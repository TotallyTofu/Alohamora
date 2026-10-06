import { describe, expect, it } from 'vitest';
import { collageCells } from './collageLayout';

describe('collageCells', () => {
  it('grid of 4 without gap is 2x2 squares', () => {
    const l = collageCells(4, 'grid', 1000, 0);
    expect(l.width).toBe(1000);
    expect(l.height).toBe(1000);
    expect(l.cells).toHaveLength(4);
    for (const c of l.cells) { expect(c.w).toBe(500); expect(c.h).toBe(500); }
    expect(l.cells[3]).toEqual({ x: 500, y: 500, w: 500, h: 500 });
  });

  it('row keeps every cell at the same y', () => {
    const l = collageCells(3, 'row', 1000, 10);
    expect(l.cells).toHaveLength(3);
    expect(new Set(l.cells.map((c) => c.y))).toEqual(new Set([10]));
  });

  it('column stacks cells top to bottom', () => {
    const l = collageCells(3, 'column', 800, 10);
    expect(l.cells[1].y).toBeGreaterThan(l.cells[0].y + l.cells[0].h - 0.001);
    expect(l.height).toBeGreaterThan(l.cells[2].y + l.cells[2].h);
  });

  it('featured makes the first cell about twice as wide as the others', () => {
    const l = collageCells(3, 'featured', 1200, 12);
    expect(l.cells[0].w / l.cells[1].w).toBeCloseTo(2, 1);
    expect(l.cells[1].x).toBeGreaterThan(l.cells[0].x + l.cells[0].w);
  });

  it('every cell stays inside the canvas', () => {
    for (const layout of ['grid', 'row', 'column', 'featured'] as const) {
      for (const n of [2, 3, 5, 7]) {
        const l = collageCells(n, layout, 1000, 12);
        for (const c of l.cells) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w).toBeLessThanOrEqual(l.width + 1);
          expect(c.y + c.h).toBeLessThanOrEqual(l.height + 1);
        }
      }
    }
  });
});
