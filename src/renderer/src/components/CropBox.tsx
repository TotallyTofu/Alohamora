import { useRef, type PointerEvent } from 'react';
import { dragRect, type DragHandle, type NormRect } from '@shared/geometry';

const HANDLES: DragHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function CropBox(p: { rect: NormRect; onChange: (r: NormRect) => void; aspect: number | null; frameAspect: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: DragHandle; x: number; y: number; start: NormRect } | null>(null);
  const down = (handle: DragHandle) => (e: PointerEvent): void => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: p.rect };
  };
  const move = (e: PointerEvent): void => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    p.onChange(dragRect(d.start, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height, p.aspect, p.frameAspect));
  };
  const r = p.rect;
  return (
    <div ref={ref} className="cropbox" onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      <div className="cropbox__rect" onPointerDown={down('move')}
        style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
        <div className="cropbox__grid" />
        {HANDLES.map((h) => <div key={h} className={`cropbox__handle cropbox__handle--${h}`} onPointerDown={down(h)} />)}
      </div>
    </div>
  );
}
