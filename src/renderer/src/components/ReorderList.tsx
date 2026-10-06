import { useRef, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

export interface ReorderItem { id: string; title: string; subtitle?: string; thumbnail?: string }

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Drag to reorder (HTML5 drag & drop, internal only) or Alt+↑/↓ on a focused row. */
export function ReorderList({ items, onChange, icon = 'file' }: {
  items: ReorderItem[]; onChange: (ids: string[]) => void; icon?: string;
}) {
  const dragging = useRef<number | null>(null);

  const apply = (from: number, to: number): void => {
    const next = move(items, from, to);
    if (next !== items) onChange(next.map((i) => i.id));
  };
  const onKey = (i: number) => (e: KeyboardEvent): void => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = i + (e.key === 'ArrowUp' ? -1 : 1);
    apply(i, to);
    // keep keyboard focus on the moved row
    requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.reorder__row')[Math.min(Math.max(to, 0), items.length - 1)]?.focus());
  };

  return (
    <ul className="reorder" aria-label="Order of files">
      {items.map((it, i) => (
        <li key={it.id} className="reorder__row" tabIndex={0} draggable onKeyDown={onKey(i)}
          aria-label={`${it.title}. Use Alt and arrow keys to move.`}
          onDragStart={(e) => { dragging.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const from = dragging.current;
            if (from !== null && from !== i) { apply(from, i); dragging.current = i; }
          }}
          onDragEnd={() => { dragging.current = null; }}>
          <Icon name="grip" size={16} className="reorder__grip" />
          <span className="reorder__thumb">{it.thumbnail ? <img src={it.thumbnail} alt="" draggable={false} /> : <Icon name={icon} size={18} />}</span>
          <span className="reorder__text">
            <span className="reorder__title">{it.title}</span>
            {it.subtitle && <span className="reorder__sub">{it.subtitle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
