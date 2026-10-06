import { useState } from 'react';
import { DEFAULT_CONVERT_OPTIONS } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import type { ConvertCardProps } from '..';

export function GifCard({ onApply, onBack, onClose }: ConvertCardProps) {
  const [width, setWidth] = useState<number>(DEFAULT_CONVERT_OPTIONS.gifWidth);
  const [fps, setFps] = useState<number>(DEFAULT_CONVERT_OPTIONS.gifFps);
  const reset = (): void => { setWidth(DEFAULT_CONVERT_OPTIONS.gifWidth); setFps(DEFAULT_CONVERT_OPTIONS.gifFps); };
  return (
    <Panel title="Make a GIF" onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ gifWidth: width, gifFps: fps })}>
      <Row label="Width">
        <Segmented label="Width" value={width} onChange={setWidth}
          options={[{ value: 320, label: '320' }, { value: 480, label: '480' }, { value: 640, label: '640' }, { value: 0, label: 'Original' }]} />
      </Row>
      <Row label="Frame rate">
        <Segmented label="Frame rate" value={fps} onChange={setFps}
          options={[{ value: 10, label: '10' }, { value: 12, label: '12' }, { value: 15, label: '15' }, { value: 24, label: '24' }]} />
      </Row>
      <p className="card-note">GIFs are large. Shorter clips work best — trim first if needed.</p>
    </Panel>
  );
}
