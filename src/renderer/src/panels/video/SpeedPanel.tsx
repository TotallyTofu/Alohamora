import { useState } from 'react';
import { formatDuration } from '@shared/time';
import { TOOL_DEFAULTS } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['video.speed'];
const row = (xs: number[]): Array<{ value: number; label: string }> => xs.map((v) => ({ value: v, label: `${v}×` }));

export function SpeedPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [factor, setFactor] = useState<number>(D.factor);
  const [keepAudio, setKeepAudio] = useState<boolean>(D.keepAudio);
  const duration = file.durationSec ?? 0;
  const round = (v: number): number => Math.round(v * 100) / 100;
  return (
    <Panel title="Change speed" onBack={onBack} onClose={onClose} applyLabel="Apply"
      onReset={() => { setFactor(D.factor); setKeepAudio(D.keepAudio); }}
      onApply={() => onApply({ factor, keepAudio: keepAudio && !!file.hasAudio })}>
      <div className="panel__stack">
        <Segmented<number> label="Slower" value={factor} onChange={setFactor} options={row([0.25, 0.5, 0.75, 1.25])} />
        <Segmented<number> label="Faster" value={factor} onChange={setFactor} options={row([1.5, 2, 3, 4])} />
      </div>
      <Slider label="Custom" value={factor} min={0.25} max={4} step={0.05} onChange={(v) => setFactor(round(v))} format={(v) => `${v}×`} />
      <Row label="Keep audio" hint={file.hasAudio ? 'Pitch is preserved' : 'This video has no audio'}>
        <Toggle label="Keep audio (pitch preserved)" checked={keepAudio && !!file.hasAudio} onChange={setKeepAudio} />
      </Row>
      <p className="panel__readout">New length {formatDuration(duration / factor)} (was {formatDuration(duration)})</p>
    </Panel>
  );
}
