import { useEffect, useMemo } from 'react';
import { buildWheel } from '@shared/wheelItems';
import { CATEGORY_ICON } from '../../components/Icon';
import { Wheel } from '../../components/Wheel/Wheel';
import { api } from '../../lib/api';
import { useOverlay } from '../store';

export function WheelStage() {
  const { files, mode, caps, active, setActive, setMode, go } = useOverlay();
  const model = useMemo(() => (caps ? buildWheel(files, mode, caps) : { items: [], category: null, mixed: false }), [files, mode, caps]);

  const pick = async (i: number, withOptions: boolean): Promise<void> => {
    const item = model.items[i];
    if (!item) return;
    if (item.kind === 'tool' && item.toolId) {
      if (!item.needsOptions && !withOptions) {
        const jobId = await api.startJob({ kind: 'tool', inputs: files.map((f) => f.path), toolId: item.toolId, options: {} });
        go({ name: 'running', jobId });
      } else {
        go({ name: 'panel', toolId: item.toolId });
      }
      return;
    }
    if (!item.target) return;
    if (item.needsOptions || withOptions) { go({ name: 'options', target: item.target }); return; }
    const jobId = await api.startJob({ kind: 'convert', inputs: files.map((f) => f.path), target: item.target });
    go({ name: 'running', jobId });
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
  const hubLabel = hovered?.label ?? (files.length > 1 ? `${files.length} files` : first?.fmt?.toUpperCase() ?? '');

  return (
    <div className="stage-wheel">
      <Wheel items={model.items} active={active} onActiveChange={setActive} onPick={(i, o) => void pick(i, o)}
        hubLabel={hubLabel} thumbnail={first?.thumbnail} hubIcon={model.category ? CATEGORY_ICON[model.category] : 'file'} />
      <p className="stage-wheel__caption">{caption}</p>
      <p className="stage-wheel__sub">
        {files.length === 1 ? first?.name : `${files.length} files`} · <kbd>Tab</kbd> {mode === 'convert' ? 'Tools' : 'Formats'}
      </p>
    </div>
  );
}
