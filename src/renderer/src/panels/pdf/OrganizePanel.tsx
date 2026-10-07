import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { PdfOrganizeOptions } from '@shared/toolOptions';
import { Button, IconButton } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { api } from '../../lib/api';
import { modClick } from '../../lib/platform';
import type { ToolPanelProps } from '..';

type Rotation = 0 | 90 | 180 | 270;
interface PageItem { src: number; rotate: Rotation }

const turn = (r: Rotation, d: 90 | -90): Rotation => ((r + d + 360) % 360) as Rotation;

export function OrganizePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const initial = useMemo<PageItem[]>(() => Array.from({ length: file.pages ?? 0 }, (_, i) => ({ src: i, rotate: 0 })), [file.pages]);
  const [pages, setPages] = useState<PageItem[]>(initial);
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchor = useRef<number | null>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void api.pdfThumbnails(file.path, 160).then((t) => { if (alive) setThumbs(t); }).catch(() => { if (alive) setThumbs([]); });
    return () => { alive = false; };
  }, [file.path]);

  const changed = pages.length !== initial.length || pages.some((p, i) => p.src !== i || p.rotate !== 0);
  const click = (e: MouseEvent, index: number): void => {
    const src = pages[index].src;
    setSelected((cur) => {
      if (e.shiftKey && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
        return new Set(pages.slice(a, b + 1).map((p) => p.src));
      }
      if (modClick(e)) { const n = new Set(cur); if (n.has(src)) n.delete(src); else n.add(src); return n; }
      return new Set([src]);
    });
    if (!e.shiftKey) anchor.current = index;
  };
  const rotateSelected = (d: 90 | -90): void => setPages((cur) => cur.map((p) => (selected.has(p.src) ? { ...p, rotate: turn(p.rotate, d) } : p)));
  const canDelete = selected.size > 0 && pages.some((p) => !selected.has(p.src));
  const deleteSelected = (): void => { setPages((cur) => cur.filter((p) => !selected.has(p.src))); setSelected(new Set()); };
  const reorder = (to: number): void => {
    const from = dragging.current;
    if (from === null || from === to) return;
    setPages((cur) => { const next = [...cur]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
    dragging.current = to;
  };
  /** Pointer-based drag (HTML5 drag & drop is unavailable with Tauri's native file-drop handler). */
  const onPointerMove = (e: PointerEvent): void => {
    if (dragging.current === null) return;
    const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.pagecard');
    if (card) reorder(Number(card.dataset.index));
  };

  return (
    <Panel title="Organize pages" onBack={onBack} onClose={onClose} applyLabel="Save PDF" applyDisabled={!changed || pages.length === 0}
      onReset={() => { setPages(initial); setSelected(new Set()); }}
      onApply={() => onApply({ pages: pages.map((p) => ({ src: p.src, rotate: p.rotate })) } satisfies PdfOrganizeOptions)}>
      <div className="panel__line" role="toolbar" aria-label="Page actions">
        <IconButton label="Rotate left" icon="rotateLeft" disabled={selected.size === 0} onClick={() => rotateSelected(-90)} />
        <IconButton label="Rotate right" icon="rotateRight" disabled={selected.size === 0} onClick={() => rotateSelected(90)} />
        <IconButton label="Delete" icon="trash" disabled={!canDelete} onClick={deleteSelected} />
        <Button variant="soft" onClick={() => setSelected(new Set(pages.map((p) => p.src)))}>Select all</Button>
        <span className="panel__readout">{pages.length} of {initial.length} pages{selected.size ? ` · ${selected.size} selected` : ''}</span>
      </div>
      {thumbs === null && <p className="card-note">Loading pages…</p>}
      <div className="pagegrid" role="listbox" aria-label="Pages" aria-multiselectable="true">
        {pages.map((p, i) => (
          <div key={p.src} role="option" aria-selected={selected.has(p.src)} tabIndex={0} data-index={i}
            className={`pagecard${selected.has(p.src) ? ' is-selected' : ''}`}
            onClick={(e) => click(e, i)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelected(new Set([p.src])); } }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              dragging.current = i;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}>
            <div className="pagecard__thumb">
              {thumbs?.[p.src] && (
                <img src={thumbs[p.src]} alt={`Page ${p.src + 1}`} draggable={false}
                  style={{ transform: `rotate(${p.rotate}deg)${p.rotate % 180 ? ' scale(0.72)' : ''}` }} />
              )}
            </div>
            <span className="pagecard__num">{p.src + 1}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
