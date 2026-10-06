import { describe, expect, it } from 'vitest';
import { FULL_RECT, clampNormRect, dragRect, fitAspect, isFullRect, toPixelRect } from './geometry';

describe('fitAspect', () => {
  it('fits a square into 16:9', () => {
    const r = fitAspect(1, 1920, 1080);
    expect(r.w).toBeCloseTo(0.5625, 4);
    expect(r.h).toBe(1);
    expect(r.x).toBeCloseTo(0.21875, 4);
    expect(r.y).toBe(0);
  });

  it('fits a wide ratio into a tall frame', () => {
    const r = fitAspect(16 / 9, 1000, 2000);
    expect(r.w).toBe(1);
    expect(r.h).toBeCloseTo(((1000 / 2000) / (16 / 9)), 4);
    expect(r.y).toBeCloseTo((1 - r.h) / 2, 6);
  });
});

describe('toPixelRect', () => {
  it('returns even numbers inside the frame when asked', () => {
    const p = toPixelRect({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1001, 501, true);
    for (const v of [p.x, p.y, p.w, p.h]) expect(v % 2).toBe(0);
    expect(p.x + p.w).toBeLessThanOrEqual(1001);
    expect(p.y + p.h).toBeLessThanOrEqual(501);
  });

  it('never returns a rect smaller than 2 px', () => {
    const p = toPixelRect({ x: 0.999, y: 0.999, w: 0.0001, h: 0.0001 }, 100, 100);
    expect(p.w).toBeGreaterThanOrEqual(2);
    expect(p.h).toBeGreaterThanOrEqual(2);
  });
});

describe('dragRect', () => {
  it('shrinks from the south-east corner', () => {
    const r = dragRect(FULL_RECT, 'se', -0.5, -0.5, null, 1);
    expect(r.w).toBeCloseTo(0.5, 6);
    expect(r.h).toBeCloseTo(0.5, 6);
  });

  it('keeps the pixel aspect ratio when locked', () => {
    const r = dragRect({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'e', 0.2, 0, 1, 16 / 9);
    expect((r.w * 16) / (r.h * 9)).toBeCloseTo(1, 1);
  });

  it('keeps the pixel aspect ratio when dragging a north handle', () => {
    const r = dragRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'n', 0, -0.1, 1, 1);
    expect(r.w / r.h).toBeCloseTo(1, 2);
    expect(r.y + r.h).toBeCloseTo(0.6, 3);
  });

  it('move stays inside the frame', () => {
    const r = dragRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'move', 2, 2, null, 1);
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
    const l = dragRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'move', -2, -2, null, 1);
    expect(l.x).toBe(0);
    expect(l.y).toBe(0);
  });
});

describe('clampNormRect / isFullRect', () => {
  it('clamps sizes and positions', () => {
    const r = clampNormRect({ x: -1, y: 2, w: 5, h: 0 });
    expect(r.w).toBe(1);
    expect(r.h).toBeCloseTo(0.02, 6);
    expect(r.x).toBe(0);
    expect(r.y).toBeLessThanOrEqual(1 - r.h + 1e-9);
  });

  it('isFullRect', () => {
    expect(isFullRect(FULL_RECT)).toBe(true);
    expect(isFullRect({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
