import { useEffect, useMemo, useState } from 'react';
import { categoryOf, fmtFromPath } from '@shared/formats';
import type { FileInfo } from '@shared/types';
import { buildWheel, type WheelItem, type WheelModel } from '@shared/wheelItems';
import { Wheel } from '../../components/Wheel/Wheel';
import { api } from '../../lib/api';
import { playClick, playTurn } from '../../lib/sound';
import { useOverlay } from '../store';

const EMPTY: WheelModel = { items: [], category: null, mixed: false };
/** After a choice, let the key finish its twist and the click be heard before the next card appears. */
const FEEDBACK_MS = 130;

export function WheelStage() {
  const { files, mode, caps, active, dragging, dragFmts, setActive, setMode, go, setDragFmts, dropFinished } = useOverlay();

  const [turn, setTurn] = useState(0);

  // The key turns (with its sound) whenever the highlight lands on a different choice.
  useEffect(() => { if (active !== null) playTurn(); }, [active]);

  const model = useMemo<WheelModel>(() => {
    if (!caps) return EMPTY;
    if (dragging && files.length === 0) {
      // Global drag: the formats come from the dragged paths until the real files are inspected.
      if (dragFmts.length === 0 || dragFmts.some((f) => f === null)) return { ...EMPTY, emptyReason: 'Drop to choose' };
      const pseudo: FileInfo[] = dragFmts.map((fmt) => ({
        path: '', name: '', base: '', ext: '', fmt, category: fmt ? categoryOf(fmt) : null, size: 0
      }));
      return buildWheel(pseudo, mode, caps);
    }
    return buildWheel(files, mode, caps);
  }, [files, mode, caps, dragging, dragFmts]);

  /** Start the job / open the card for `item` using `inputs` (explicit so a drop can use the freshly resolved files). */
  const run = async (inputs: FileInfo[], item: WheelItem, withOptions: boolean): Promise<void> => {
    setTurn((t) => t + 1);          // the key twists …
    playClick();                    // … and the lock clicks
    const settle = new Promise<void>((resolve) => { setTimeout(resolve, FEEDBACK_MS); });
    const paths = inputs.map((f) => f.path);
    if (item.kind === 'tool' && item.toolId) {
      if (!item.needsOptions && !withOptions) {
        const [jobId] = await Promise.all([api.startJob({ kind: 'tool', inputs: paths, toolId: item.toolId, options: {} }), settle]);
        go({ name: 'running', jobId });
      } else {
        await settle;
        go({ name: 'panel', toolId: item.toolId });
      }
      return;
    }
    if (!item.target) return;
    if (item.needsOptions || withOptions) { await settle; go({ name: 'options', target: item.target }); return; }
    const [jobId] = await Promise.all([api.startJob({ kind: 'convert', inputs: paths, target: item.target }), settle]);
    go({ name: 'running', jobId });
  };
  const pick = async (i: number, withOptions: boolean): Promise<void> => {
    const item = model.items[i];
    if (item && !dragging) await run(files, item, withOptions);
  };

  const onDropFiles = async (paths: string[], hit: number | 'center' | null): Promise<void> => {
    if (paths.length === 0) return;
    const before = model;
    const real = await api.overlayDropped(paths);
    dropFinished(real);
    if (!caps) return;
    const after = buildWheel(real, mode, caps);
    // Only act when the slice under the cursor means the same thing now that the real files are known.
    if (typeof hit === 'number' && after.items[hit] && after.items[hit].key === before.items[hit]?.key) {
      await run(real, after.items[hit], false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const n = model.items.length;
      if (e.key === 'Escape') { void api.closeOverlay(); return; }
      if (e.key === 'Tab') { e.preventDefault(); setMode(mode === 'convert' ? 'tools' : 'convert'); return; }
      if (n === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(active === null ? 0 : (active + 1) % n); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(active === null ? n - 1 : (active - 1 + n) % n); }
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) void pick(Number(e.key) - 1, false);
      else if (e.key === 'Enter' && active !== null) void pick(active, e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hovered = active !== null ? model.items[active] : undefined;
  const first = files[0];
  const caption = hovered
    ? hovered.kind === 'format' ? `Convert to ${hovered.label}` : hovered.label
    : model.emptyReason ?? (mode === 'convert' ? 'Convert formats' : 'Advanced tools');
  const hubLabel = hovered?.label ?? (dragging && files.length === 0 && model.items.length === 0
    ? 'Drop to choose'
    : files.length > 1 ? `${files.length} files` : first?.fmt?.toUpperCase() ?? '');
  const subtitle = dragging && files.length === 0
    ? `Drop on a slice · ${dragFmts.length} item${dragFmts.length === 1 ? '' : 's'}`
    : files.length === 1 ? first?.name : `${files.length} files`;

  return (
    <div className="stage-wheel">
      <Wheel items={model.items} active={active} pickToken={turn} onActiveChange={setActive} onPick={(i, o) => void pick(i, o)}
        hubLabel={hubLabel} thumbnail={first?.thumbnail}
        onDragPaths={(paths) => setDragFmts(paths.map((path) => fmtFromPath(path)))}
        onDropFiles={(paths, hit) => { void onDropFiles(paths, hit); }} />
      <p className="stage-wheel__caption">{caption}</p>
      <p className="stage-wheel__sub">{subtitle} · <kbd>Tab</kbd> {mode === 'convert' ? 'Tools' : 'Formats'}</p>
    </div>
  );
}
