import { useEffect, useRef, type PointerEvent } from 'react';
import { MIN_NORM, clampNormRect, dragRect, type DragHandle, type NormRect } from '@shared/geometry';

const HANDLES: DragHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface EditableRect { id: string; rect: NormRect }

export interface RectEditorProps {
  rects: EditableRect[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (rects: EditableRect[]) => void;
  frameAspect: number;
  labelOf?: (id: string) => string;
  /** Extra class per box (e.g. 'rectedit__rect--blur') so each box can preview its effect. */
  classOf?: (id: string) => string;
}

interface Drag { id: string; handle: DragHandle; x: number; y: number; start: NormRect }

/** Draw, move, resize and delete many boxes over a picture (used by Redact). */
export function RectEditor(p: RectEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const begin = (id: string, handle: DragHandle, e: PointerEvent, start: NormRect): void => {
    drag.current = { id, handle, x: e.clientX, y: e.clientY, start };
  };

  const downEmpty = (e: PointerEvent): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const id = crypto.randomUUID();
    const start = clampNormRect({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height, w: MIN_NORM, h: MIN_NORM });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    p.onChange([...p.rects, { id, rect: start }]);
    p.onSelect(id);
    begin(id, 'se', e, start);
  };

  const downRect = (item: EditableRect, handle: DragHandle) => (e: PointerEvent): void => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    p.onSelect(item.id);
    begin(item.id, handle, e, item.rect);
  };

  const move = (e: PointerEvent): void => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    const next = dragRect(d.start, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height, null, p.frameAspect);
    p.onChange(p.rects.map((r) => (r.id === d.id ? { id: r.id, rect: next } : r)));
  };

  const remove = (id: string): void => {
    p.onChange(p.rects.filter((r) => r.id !== id));
    if (p.selected === id) p.onSelect(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.selected && !typing) { e.preventDefault(); remove(p.selected); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={ref} className="rectedit" onPointerDown={downEmpty} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      {p.rects.map((item) => {
        const on = item.id === p.selected;
        const r = item.rect;
        return (
          <div key={item.id} className={`rectedit__rect${on ? ' is-selected' : ''} ${p.classOf?.(item.id) ?? ''}`} onPointerDown={downRect(item, 'move')}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
            {on && p.labelOf && <span className="rectedit__label">{p.labelOf(item.id)}</span>}
            {on && (
              <button type="button" className="rectedit__delete" aria-label="Delete box"
                onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(item.id)}>×</button>
            )}
            {on && HANDLES.map((h) => <div key={h} className={`cropbox__handle cropbox__handle--${h}`} onPointerDown={downRect(item, h)} />)}
          </div>
        );
      })}
    </div>
  );
}
