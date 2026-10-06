export interface NormRect { x: number; y: number; w: number; h: number }   // 0..1
export interface PixelRect { x: number; y: number; w: number; h: number }

export type DragHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const MIN_NORM = 0.02;
export const FULL_RECT: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export const ASPECTS: Array<{ key: string; label: string; ratio: number | null }> = [
  { key: 'free', label: 'Freeform', ratio: null },
  { key: 'original', label: 'Original', ratio: null },   // ratio computed from media
  { key: '1:1', label: 'Square 1:1', ratio: 1 },
  { key: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { key: '9:16', label: 'Story 9:16', ratio: 9 / 16 },
  { key: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '21:9', label: 'Cinema 21:9', ratio: 21 / 9 }
];

export function clampNormRect(r: NormRect): NormRect {
  const w = Math.min(1, Math.max(MIN_NORM, r.w));
  const h = Math.min(1, Math.max(MIN_NORM, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/** Rect after dragging `handle` by (dx, dy) in normalized units.
 *  aspect = wanted PIXEL width/height (null = free). frameAspect = media pixel width/height. */
export function dragRect(start: NormRect, handle: DragHandle, dx: number, dy: number, aspect: number | null, frameAspect: number): NormRect {
  if (handle === 'move') {
    return {
      ...start,
      x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
      y: Math.min(1 - start.h, Math.max(0, start.y + dy))
    };
  }
  let { x, y, w, h } = start;
  if (handle.includes('e')) w = start.w + dx;
  if (handle.includes('w')) { x = start.x + dx; w = start.w - dx; }
  if (handle.includes('s')) h = start.h + dy;
  if (handle.includes('n')) { y = start.y + dy; h = start.h - dy; }
  w = Math.max(MIN_NORM, w);
  h = Math.max(MIN_NORM, h);
  if (aspect !== null) {
    const k = frameAspect / aspect;            // keeps (w*W)/(h*H) === aspect
    if (handle === 'n' || handle === 's') w = h / k; else h = w * k;
    // Shrink (keeping the ratio) when the locked rect would leave the frame, instead of clamping one side.
    const fixedRight = handle.includes('w');
    const fixedBottom = handle.includes('n');
    const maxW = fixedRight ? start.x + start.w : 1 - start.x;
    const maxH = fixedBottom ? start.y + start.h : 1 - start.y;
    const scale = Math.min(1, maxW / w, maxH / h);
    w *= scale;
    h *= scale;
    x = fixedRight ? start.x + start.w - w : start.x;
    y = fixedBottom ? start.y + start.h - h : start.y;
  }
  return clampNormRect({ x, y, w, h });
}

/** Largest centred rect with pixel aspect `ratio` inside a width×height frame. */
export function fitAspect(ratio: number, width: number, height: number): NormRect {
  const frame = width / height;
  if (ratio > frame) {
    const h = frame / ratio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = ratio / frame;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Normalized → integer pixels inside the frame. `even` rounds down to even numbers (required by H.264). */
export function toPixelRect(r: NormRect, width: number, height: number, even = false): PixelRect {
  let x = Math.round(r.x * width);
  let y = Math.round(r.y * height);
  let w = Math.round(r.w * width);
  let h = Math.round(r.h * height);
  w = Math.max(2, Math.min(w, width - x));
  h = Math.max(2, Math.min(h, height - y));
  if (even) {
    x -= x % 2; y -= y % 2;
    w -= w % 2; h -= h % 2;
  }
  return { x, y, w, h };
}

export function isFullRect(r: NormRect): boolean {
  return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
}
