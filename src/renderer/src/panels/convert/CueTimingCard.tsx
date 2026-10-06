import { useState } from 'react';
import { DEFAULT_CONVERT_OPTIONS } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import type { ConvertCardProps } from '..';

export function CueTimingCard({ onApply, onBack, onClose }: ConvertCardProps) {
  const [timing, setTiming] = useState<'reading' | 'fixed'>(DEFAULT_CONVERT_OPTIONS.cueTiming);
  const [seconds, setSeconds] = useState<number>(DEFAULT_CONVERT_OPTIONS.secondsPerCue);
  const reset = (): void => { setTiming(DEFAULT_CONVERT_OPTIONS.cueTiming); setSeconds(DEFAULT_CONVERT_OPTIONS.secondsPerCue); };
  return (
    <Panel title="Make subtitles" onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ cueTiming: timing, secondsPerCue: seconds })}>
      <Row label="Timing">
        <Segmented label="Timing" value={timing} onChange={setTiming}
          options={[{ value: 'reading', label: 'Reading speed' }, { value: 'fixed', label: 'Fixed' }]} />
      </Row>
      {timing === 'fixed' && (
        <Slider label="Seconds" value={seconds} min={1} max={10} step={0.5} onChange={setSeconds} format={(v) => `${v}s`} />
      )}
      <p className="card-note">
        One subtitle per line of text. Long lines are split and wrapped to two lines of up to 42 characters.
      </p>
    </Panel>
  );
}
