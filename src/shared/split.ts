import type { VideoSplitOptions } from './toolOptions';

export function splitSegments(duration: number, o: VideoSplitOptions): Array<{ start: number; end: number }> {
  let cuts: number[];
  if (o.mode === 'parts') {
    const n = Math.max(2, Math.min(100, Math.round(o.parts)));
    cuts = Array.from({ length: n - 1 }, (_, i) => (duration * (i + 1)) / n);
  } else if (o.mode === 'every') {
    const s = Math.max(1, o.everySec);
    cuts = [];
    for (let t = s; t < duration - 0.05; t += s) cuts.push(t);
  } else {
    cuts = [...o.times];
  }
  const clean = [...new Set(cuts.filter((t) => t > 0.05 && t < duration - 0.05).map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  const pts = [0, ...clean, duration];
  return pts.slice(0, -1).map((s, i) => ({ start: s, end: pts[i + 1] }));
}
