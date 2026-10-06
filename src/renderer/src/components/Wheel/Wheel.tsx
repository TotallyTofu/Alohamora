import type { WheelItem } from '@shared/wheelItems';
import { useRef } from 'react';
import { Icon } from '../Icon';
import { KeyLock } from './KeyLock';
import { DEFAULT_GEOMETRY as G, hitTest, labelPoint, sliceOffset, slicePath } from './wheelGeometry';
import './wheel.css';

export interface WheelProps {
  items: WheelItem[];
  active: number | null;
  onActiveChange?: (i: number | null) => void;
  onPick?: (i: number, withOptions: boolean) => void;
  hubLabel?: string;
  thumbnail?: string;
  /** Bump this number each time a choice is made: the key in the centre gives a twist. */
  pickToken?: number;
  demo?: boolean;                                                     // non-interactive (home page)
  onDropFiles?: (dt: DataTransfer, hit: number | 'center' | null) => void;   // global-drag mode
  onDragTypes?: (dt: DataTransfer) => void;                           // global-drag mode: read MIME types
}

export function Wheel(p: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const n = p.items.length;
  const hubSize = (G.rInner - 6) * 2;

  const hit = (clientX: number, clientY: number): number | 'center' | null => {
    const el = ref.current;
    if (!el || n === 0) return null;
    const r = el.getBoundingClientRect();
    const s = r.width / G.size;                     // supports CSS scaling
    return hitTest((clientX - r.left) / s, (clientY - r.top) / s, n, G);
  };
  const setActive = (h: number | 'center' | null): void => p.onActiveChange?.(typeof h === 'number' ? h : null);

  return (
    <div
      ref={ref}
      className={`wheel${p.demo ? ' wheel--demo' : ''}`}
      style={{ width: G.size, height: G.size }}
      role="menu"
      aria-activedescendant={p.active !== null ? `wheel-item-${p.active}` : undefined}
      onPointerMove={(e) => { if (!p.demo) setActive(hit(e.clientX, e.clientY)); }}
      onPointerLeave={() => { if (!p.demo) p.onActiveChange?.(null); }}
      onClick={(e) => { const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, false); }}
      onContextMenu={(e) => { e.preventDefault(); const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, true); }}
      onDragEnter={(e) => { if (p.onDragTypes) p.onDragTypes(e.dataTransfer); }}
      onDragOver={(e) => {
        if (!p.onDropFiles) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';      // NEVER 'move' — Explorer/Finder/Nautilus could delete the original
        setActive(hit(e.clientX, e.clientY));
      }}
      onDrop={(e) => { if (!p.onDropFiles) return; e.preventDefault(); p.onDropFiles(e.dataTransfer, hit(e.clientX, e.clientY)); }}
    >
      <svg className="wheel__svg" width={G.size} height={G.size} viewBox={`0 0 ${G.size} ${G.size}`} aria-hidden="true">
        <defs>
          <linearGradient id="kbSliceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--slice-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--slice-bottom)' }} />
          </linearGradient>
          <filter id="kbSliceShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.16" />
          </filter>
        </defs>
        <circle className="wheel__base" cx={G.cx} cy={G.cy} r={G.rOuter + 8} />
        {p.items.map((item, i) => {
          const off = sliceOffset(i, n, 3);
          return (
            <path key={item.key} d={slicePath(i, n, G)} className={`wheel__slice${i === p.active ? ' is-active' : ''}`}
              strokeWidth={G.corner * 2} strokeLinejoin="round" filter="url(#kbSliceShadow)"
              style={{ ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }} />
          );
        })}
      </svg>
      {p.items.map((item, i) => {
        const pt = labelPoint(i, n, G);
        const off = sliceOffset(i, n, 3);
        return (
          <div key={item.key} id={`wheel-item-${i}`} role="menuitem" aria-label={item.label}
            className={`wheel__label${i === p.active ? ' is-active' : ''}`}
            style={{ left: pt.x, top: pt.y, ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }}>
            {item.icon && <Icon name={item.icon} size={18} />}
            <span>{item.label}</span>
          </div>
        );
      })}
      <div className="wheel__hub" style={{ width: hubSize, height: hubSize }}>
        {p.thumbnail && <img className="wheel__thumb" src={p.thumbnail} alt="" />}
        <KeyLock angle={p.active !== null && n > 0 ? (p.active * 360) / n : null} turnToken={p.pickToken ?? 0} size={hubSize} />
        {p.hubLabel && <span className="sr-only">{p.hubLabel}</span>}
      </div>
    </div>
  );
}
