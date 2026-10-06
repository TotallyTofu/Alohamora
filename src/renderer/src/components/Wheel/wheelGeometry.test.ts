import { describe, expect, it } from 'vitest';
import { DEFAULT_GEOMETRY as G, hitTest, labelPoint, polar, sliceOffset, slicePath } from './wheelGeometry';

describe('hitTest', () => {
  it('maps the four compass points of a 4-slice wheel', () => {
    expect(hitTest(170, 30, 4, G)).toBe(0);
    expect(hitTest(310, 170, 4, G)).toBe(1);
    expect(hitTest(170, 310, 4, G)).toBe(2);
    expect(hitTest(30, 170, 4, G)).toBe(3);
  });

  it('centre and far-away points', () => {
    expect(hitTest(170, 170, 4, G)).toBe('center');
    expect(hitTest(0, 0, 4, G)).toBeNull();
    expect(hitTest(170, 30, 0, G)).toBeNull();
  });

  it('with 7 slices the point just right of 12 o\'clock is still slice 0', () => {
    expect(hitTest(176, 30, 7, G)).toBe(0);
    expect(hitTest(164, 30, 7, G)).toBe(0);
  });

  it('wraps: just left of 12 o\'clock is slice 0, not the last slice', () => {
    expect(hitTest(165, 20, 8, G)).toBe(0);
  });
});

describe('slicePath / labelPoint / polar', () => {
  it('slicePath has a move command and two arcs', () => {
    const d = slicePath(0, 8, G);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.split(' A ')).toHaveLength(3);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('a single slice (n=1) uses large-arc flags', () => {
    expect(slicePath(0, 1, G)).toContain(' 0 1 1 ');
  });

  it('polar 0° is straight up, 90° is right', () => {
    const up = polar(100, 100, 50, 0);
    expect(up.x).toBeCloseTo(100, 6);
    expect(up.y).toBeCloseTo(50, 6);
    const right = polar(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150, 6);
    expect(right.y).toBeCloseTo(100, 6);
  });

  it('label of slice 0 sits above the centre; offsets point outward', () => {
    const p = labelPoint(0, 6, G);
    expect(p.x).toBeCloseTo(G.cx, 6);
    expect(p.y).toBeLessThan(G.cy);
    const o = sliceOffset(0, 6, 3);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(-3, 6);
  });
});
