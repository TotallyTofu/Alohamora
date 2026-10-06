import { useState } from 'react';
import { DEFAULT_CONVERT_OPTIONS } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import type { ConvertCardProps } from '..';

export function SvgCard({ onApply, onBack, onClose }: ConvertCardProps) {
  const [mode, setMode] = useState<'trace' | 'embed'>(DEFAULT_CONVERT_OPTIONS.svgMode);
  const [colors, setColors] = useState<number>(DEFAULT_CONVERT_OPTIONS.svgColors);
  const reset = (): void => { setMode(DEFAULT_CONVERT_OPTIONS.svgMode); setColors(DEFAULT_CONVERT_OPTIONS.svgColors); };
  return (
    <Panel title="Convert to SVG" onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ svgMode: mode, svgColors: colors })}>
      <Row label="Mode">
        <Segmented label="Mode" value={mode} onChange={setMode}
          options={[{ value: 'trace', label: 'Trace (vector)' }, { value: 'embed', label: 'Embed (exact)' }]} />
      </Row>
      {mode === 'trace' && (
        <Row label="Colors">
          <Segmented label="Colors" value={colors} onChange={setColors}
            options={[{ value: 2, label: '2' }, { value: 8, label: '8' }, { value: 16, label: '16' }, { value: 32, label: '32' }]} />
        </Row>
      )}
      <p className="card-note">
        {mode === 'trace'
          ? 'Turns shapes into vector paths — best for logos, icons and flat artwork.'
          : 'Wraps the exact pixels inside an SVG file. It will not become a vector.'}
      </p>
    </Panel>
  );
}
