import { useMemo, useState } from 'react';
import { Panel } from '../../components/Panel';
import { ReorderList } from '../../components/ReorderList';
import { baseName } from '../../lib/format';
import type { ToolPanelProps } from '..';

export function MergePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const [order, setOrder] = useState(files.map((f) => f.path));
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const total = files.reduce((n, f) => n + (f.pages ?? 0), 0);
  return (
    <Panel title="Merge PDFs" onBack={onBack} onClose={onClose} applyLabel="Merge" onReset={() => setOrder(files.map((f) => f.path))}
      onApply={() => onApply({ order })}>
      <p className="card-note">Drag to change the order. Hold <kbd>Alt</kbd> and use the arrow keys to move a file with the keyboard.</p>
      <ReorderList icon="pdf" onChange={setOrder}
        items={order.map((p) => byPath.get(p)).filter((f) => !!f).map((f) => ({
          id: f.path, title: baseName(f.path), thumbnail: f.thumbnail, subtitle: `${f.pages ?? '?'} pages`
        }))} />
      {total > 0 && <p className="panel__readout" style={{ marginLeft: 0 }}>{total} pages in total</p>}
    </Panel>
  );
}
