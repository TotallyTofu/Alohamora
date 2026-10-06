import { describe, expect, it } from 'vitest';
import { buildEditSpec, mul } from './editPipeline';
import { DEFAULT_EDIT } from './toolOptions';

describe('buildEditSpec', () => {
  it('the default parameters produce a no-op spec', () => {
    expect(buildEditSpec(DEFAULT_EDIT)).toEqual({
      linear: null, modulate: null, recomb: null, grayscale: false, negate: false, sharpenSigma: null, blurSigma: null, vignette: 0
    });
  });

  it('exposure doubles the values per EV', () => {
    expect(buildEditSpec({ ...DEFAULT_EDIT, exposure: 1 }).linear).toEqual([2, 0]);
  });

  it('contrast pivots around mid-grey', () => {
    expect(buildEditSpec({ ...DEFAULT_EDIT, contrast: 50 }).linear).toEqual([1.5, -64]);
  });

  it('brightness shifts the offset', () => {
    const [a, b] = buildEditSpec({ ...DEFAULT_EDIT, brightness: 50 }).linear ?? [0, 0];
    expect(a).toBe(1);
    expect(b).toBeCloseTo(64, 6);
  });

  it('saturation and hue go to modulate', () => {
    expect(buildEditSpec({ ...DEFAULT_EDIT, saturation: -100 }).modulate).toEqual({ saturation: 0, hue: 0 });
    expect(buildEditSpec({ ...DEFAULT_EDIT, hue: 90.4 }).modulate).toEqual({ saturation: 1, hue: 90 });
  });

  it('warmth shifts red up and blue down', () => {
    const m = buildEditSpec({ ...DEFAULT_EDIT, warmth: 100 }).recomb;
    expect(m?.[0][0]).toBeGreaterThan(1);
    expect(m?.[2][2]).toBeLessThan(1);
  });

  it('effects', () => {
    expect(buildEditSpec({ ...DEFAULT_EDIT, effect: 'sepia' }).recomb).not.toBeNull();
    expect(buildEditSpec({ ...DEFAULT_EDIT, effect: 'bw' }).grayscale).toBe(true);
    expect(buildEditSpec({ ...DEFAULT_EDIT, effect: 'invert' }).negate).toBe(true);
    expect(buildEditSpec({ ...DEFAULT_EDIT, effect: 'vintage' }).vignette).toBeCloseTo(0.35, 6);
    expect(buildEditSpec({ ...DEFAULT_EDIT, vignette: 250 }).vignette).toBe(1);
  });

  it('detail and blur become sigmas', () => {
    expect(buildEditSpec({ ...DEFAULT_EDIT, detail: 40 }).sharpenSigma).toBeCloseTo(1.5, 6);
    expect(buildEditSpec({ ...DEFAULT_EDIT, blur: 50 }).blurSigma).toBeCloseTo(10.3, 6);
  });

  it('mul multiplies 3x3 matrices', () => {
    const a: [[number, number, number], [number, number, number], [number, number, number]] = [[2, 0, 0], [0, 2, 0], [0, 0, 2]];
    const id: typeof a = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    expect(mul(a, id)).toEqual(a);
    expect(mul(a, a)[1][1]).toBe(4);
  });
});
