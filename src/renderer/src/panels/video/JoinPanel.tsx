import { useMemo, useState } from 'react';
import { formatDuration } from '@shared/time';
import { ReorderList } from '../../components/ReorderList';
import { Panel } from '../../components/Panel';
import { baseName } from '../../lib/format';
import type { ToolPanelProps } from '..';

export function JoinPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const [order, setOrder] = useState<string[]>(files.map((f) => f.path));
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const ordered = order.map((p) => byPath.get(p)).filter((f) => !!f);
  const first = files[0];
  const differ = files.some((f) => f.width !== first.width || f.height !== first.height
    || f.videoCodec !== first.videoCodec || f.audioCodec !== first.audioCodec);
  return (
    <Panel title="Join videos" onBack={onBack} onClose={onClose} applyLabel="Join" onReset={() => setOrder(files.map((f) => f.path))}
      onApply={() => onApply({ order })}>
      <p className="card-note">Drag to change the order. Hold <kbd>Alt</kbd> and use the arrow keys to move a clip with the keyboard.</p>
      <ReorderList icon="video" onChange={setOrder}
        items={ordered.map((f) => ({
          id: f.path, title: baseName(f.path), thumbnail: f.thumbnail,
          subtitle: `${formatDuration(f.durationSec ?? 0)}${f.width ? ` · ${f.width}×${f.height}` : ''}`
        }))} />
      {differ && <p className="card-note">Clips differ — they'll be re-encoded to MP4 (slower).</p>}
    </Panel>
  );
}
