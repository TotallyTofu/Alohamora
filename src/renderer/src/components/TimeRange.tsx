import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { formatTimecode } from '@shared/time';
import { IconButton } from './Button';

type Grab = 'start' | 'end' | 'head';

export interface TimeRangeProps {
  duration: number;
  playhead: number;
  onSeek: (t: number) => void;
  range?: { start: number; end: number };
  onRange?: (start: number, end: number) => void;
  marks?: Array<{ start: number; end: number }>;
  step?: number;                                   // seconds per step (default 1/30)
}

export function TimeRange(p: TimeRangeProps) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<Grab | null>(null);
  const step = p.step ?? 1 / 30;
  const d = p.duration || 1;
  const pct = (t: number): string => `${Math.min(Math.max(t / d, 0), 1) * 100}%`;

  const timeAt = (clientX: number): number => {
    const r = (track.current as HTMLDivElement).getBoundingClientRect();
    return Math.min(p.duration, Math.max(0, ((clientX - r.left) / r.width) * p.duration));
  };
  const apply = (g: Grab, t: number): void => {
    if (g === 'head') { p.onSeek(t); return; }
    if (!p.range || !p.onRange) return;
    if (g === 'start') { const s = Math.min(t, p.range.end - 0.1); p.onRange(Math.max(0, s), p.range.end); p.onSeek(Math.max(0, s)); }
    else { const e = Math.max(t, p.range.start + 0.1); p.onRange(p.range.start, Math.min(p.duration, e)); p.onSeek(Math.min(p.duration, e)); }
  };
  const down = (g: Grab) => (e: PointerEvent): void => {
    e.stopPropagation();
    grab.current = g;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    apply(g, timeAt(e.clientX));
  };
  const key = (g: Grab) => (e: KeyboardEvent): void => {
    const delta = (e.shiftKey ? 1 : step) * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    if (!delta) return;
    e.preventDefault();
    const base = g === 'head' ? p.playhead : g === 'start' ? (p.range?.start ?? 0) : (p.range?.end ?? 0);
    apply(g, Math.min(p.duration, Math.max(0, base + delta)));
  };

  return (
    <div className="timerange">
      <div className="timerange__row">
        <IconButton label="Previous frame" icon="stepBack" onClick={() => p.onSeek(Math.max(0, p.playhead - step))} />
        <div ref={track} className="timerange__track" onPointerDown={down('head')}
          onPointerMove={(e) => { if (grab.current) apply(grab.current, timeAt(e.clientX)); }}
          onPointerUp={() => { grab.current = null; }}>
          {p.marks?.map((m, i) => (
            <div key={i} className="timerange__mark" style={{ left: pct(m.start), width: `calc(${pct(m.end)} - ${pct(m.start)})` }} />
          ))}
          {p.range && <div className="timerange__sel" style={{ left: pct(p.range.start), width: `calc(${pct(p.range.end)} - ${pct(p.range.start)})` }} />}
          {p.range && <button type="button" className="timerange__handle" style={{ left: pct(p.range.start) }} aria-label="Start" onPointerDown={down('start')} onKeyDown={key('start')} />}
          {p.range && <button type="button" className="timerange__handle" style={{ left: pct(p.range.end) }} aria-label="End" onPointerDown={down('end')} onKeyDown={key('end')} />}
          <div className="timerange__head" style={{ left: pct(p.playhead) }} role="slider" tabIndex={0} aria-label="Playhead"
            aria-valuemin={0} aria-valuemax={p.duration} aria-valuenow={p.playhead} onPointerDown={down('head')} onKeyDown={key('head')} />
        </div>
        <IconButton label="Next frame" icon="stepForward" onClick={() => p.onSeek(Math.min(p.duration, p.playhead + step))} />
      </div>
      <div className="timerange__labels">
        <span>{formatTimecode(p.range ? p.range.start : p.playhead)}</span>
        <span>{formatTimecode(p.range ? p.range.end : p.duration)}</span>
      </div>
    </div>
  );
}
