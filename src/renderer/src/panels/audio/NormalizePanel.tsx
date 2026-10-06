import { useState } from 'react';
import { TOOL_DEFAULTS, type AudioNormalizeOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['audio.normalize'];

export function NormalizePanel({ onApply, onBack, onClose }: ToolPanelProps) {
  const [target, setTarget] = useState<number>(D.target);
  return (
    <Panel title="Normalize volume" onBack={onBack} onClose={onClose} applyLabel="Normalize" onReset={() => setTarget(D.target)}
      onApply={() => onApply({ target, truePeak: D.truePeak } satisfies AudioNormalizeOptions)}>
      <Row label="Target loudness">
        <Segmented<number> label="Target loudness" value={target} onChange={setTarget}
          options={[{ value: -14, label: 'Streaming −14' }, { value: -16, label: 'Podcast −16' }, { value: -23, label: 'Broadcast −23' }]} />
      </Row>
      <p className="card-note">Two-pass EBU R128 loudness normalization. Peaks are limited to −1.5 dBTP.</p>
    </Panel>
  );
}
