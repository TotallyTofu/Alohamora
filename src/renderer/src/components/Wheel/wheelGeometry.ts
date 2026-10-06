export interface WheelGeometry { size: number; cx: number; cy: number; rOuter: number; rInner: number; gap: number; corner: number }

export const DEFAULT_GEOMETRY: WheelGeometry = { size: 340, cx: 170, cy: 170, rOuter: 160, rInner: 62, gap: 6, corner: 12 };

/** Angle 0° = 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path of slice i of n. It is shrunk by `corner` on every side so that a round-joined
 *  stroke of width 2*corner restores the full size WITH rounded corners. Slice 0 is centred at 12 o'clock. */
export function slicePath(i: number, n: number, g: WheelGeometry): string {
  const span = 360 / n;
  const a0 = i * span - span / 2;
  const a1 = a0 + span;
  const ro = g.rOuter - g.corner;
  const ri = g.rInner + g.corner;
  const pad = (r: number): number => ((g.gap / 2 + g.corner) / r) * (180 / Math.PI);
  const p1 = polar(g.cx, g.cy, ro, a0 + pad(ro));
  const p2 = polar(g.cx, g.cy, ro, a1 - pad(ro));
  const p3 = polar(g.cx, g.cy, ri, a1 - pad(ri));
  const p4 = polar(g.cx, g.cy, ri, a0 + pad(ri));
  const largeOuter = span - 2 * pad(ro) > 180 ? 1 : 0;
  const largeInner = span - 2 * pad(ri) > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${ro} ${ro} 0 ${largeOuter} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ri} ${ri} 0 ${largeInner} 0 ${p4.x} ${p4.y} Z`;
}

/** Centre of slice i (where the icon + label go). */
export function labelPoint(i: number, n: number, g: WheelGeometry): { x: number; y: number } {
  return polar(g.cx, g.cy, (g.rOuter + g.rInner) / 2, i * (360 / n));
}

/** Small outward offset for the active slice. */
export function sliceOffset(i: number, n: number, distance: number): { x: number; y: number } {
  const p = polar(0, 0, distance, i * (360 / n));
  return { x: p.x, y: p.y };
}

/** Which slice is under the point (wheel-local coordinates)? */
export function hitTest(x: number, y: number, n: number, g: WheelGeometry): number | 'center' | null {
  const dx = x - g.cx;
  const dy = y - g.cy;
  const d = Math.hypot(dx, dy);
  if (d < g.rInner) return 'center';
  if (d > g.rOuter + 24 || n === 0) return null;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;   // 0 = up, clockwise
  deg = (deg + 360 + 180 / n) % 360;                     // shift so slice 0 spans [0, span)
  return Math.floor(deg / (360 / n)) % n;
}
