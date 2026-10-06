import type { EditParams } from './toolOptions';

type M3 = [[number, number, number], [number, number, number], [number, number, number]];
const I: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const SEPIA: M3 = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];

export function mul(a: M3, b: M3): M3 {
  const r = (i: number, j: number): number => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return [[r(0, 0), r(0, 1), r(0, 2)], [r(1, 0), r(1, 1), r(1, 2)], [r(2, 0), r(2, 1), r(2, 2)]];
}
function mix(a: M3, b: M3, t: number): M3 {
  return a.map((row, i) => row.map((v, j) => v * t + b[i][j] * (1 - t))) as M3;
}

export interface EditSpec {
  linear: [number, number] | null;                       // out = a*in + b
  modulate: { saturation: number; hue: number } | null;
  recomb: M3 | null;
  grayscale: boolean;
  negate: boolean;
  sharpenSigma: number | null;
  blurSigma: number | null;
  vignette: number;                                       // 0..1
}

export function buildEditSpec(p: EditParams): EditSpec {
  const m = Math.pow(2, p.exposure);
  const c = 1 + p.contrast / 100;
  const a = m * c;
  const b = 128 * (1 - c) + p.brightness * 1.28;
  const sat = 1 + p.saturation / 100;
  let recomb: M3 | null = null;
  if (p.warmth !== 0) {
    const w = (p.warmth / 100) * 0.12;
    recomb = [[1 + w, 0, 0], [0, 1, 0], [0, 0, 1 - w]];
  }
  if (p.effect === 'sepia' || p.effect === 'vintage') {
    const s = p.effect === 'sepia' ? SEPIA : mix(SEPIA, I, 0.5);
    recomb = mul(s, recomb ?? I);
  }
  return {
    linear: Math.abs(a - 1) > 1e-6 || Math.abs(b) > 1e-6 ? [a, b] : null,
    modulate: sat !== 1 || p.hue !== 0 ? { saturation: sat, hue: Math.round(p.hue) } : null,
    recomb,
    grayscale: p.effect === 'bw',
    negate: p.effect === 'invert',
    sharpenSigma: p.detail > 0 ? 0.5 + p.detail / 40 : null,
    blurSigma: p.blur > 0 ? 0.3 + p.blur / 5 : null,
    vignette: Math.min(1, (p.vignette + (p.effect === 'vintage' ? 35 : 0)) / 100)
  };
}
