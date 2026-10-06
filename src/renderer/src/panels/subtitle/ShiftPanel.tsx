import { useState } from 'react';
import type { SubtitleShiftOptions } from '@shared/toolOptions';
import { Button } from '../../components/Button';
import { Panel, Row } from '../../components/Panel';
import { Slider } from '../../components/Slider';
import { TextField } from '../../components/TextField';
import type { ToolPanelProps } from '..';

export function ShiftPanel({ onApply, onBack, onClose }: ToolPanelProps) {
  const [ms, setMs] = useState(0);
  const set = (v: number): void => setMs(Math.round(Number.isFinite(v) ? v : 0));
  return (
    <Panel title="Shift subtitles" onBack={onBack} onClose={onClose} applyLabel="Shift" applyDisabled={ms === 0} onReset={() => setMs(0)}
      onApply={() => onApply({ offsetMs: ms } satisfies SubtitleShiftOptions)}>
      <Slider label="Offset" value={ms / 1000} min={-10} max={10} step={0.05} onChange={(v) => set(v * 1000)}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}s`} onReset={() => setMs(0)} />
      <div className="panel__line">
        <Button variant="soft" onClick={() => set(ms - 500)}>−0.5 s</Button>
        <Button variant="soft" onClick={() => set(ms + 500)}>+0.5 s</Button>
      </div>
      <Row label="Milliseconds">
        <div className="panel__small"><TextField label="Offset in milliseconds" type="number" value={String(ms)} onChange={(v) => set(Number(v))} /></div>
      </Row>
      <p className="card-note">Positive = subtitles appear later.</p>
    </Panel>
  );
}
