import { useEffect, useState } from 'react';
import { TOOL_DEFAULTS, type AudioVisualizeOptions } from '@shared/toolOptions';
import { ColorSwatches } from '../../components/ColorSwatches';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['audio.visualize'];
type Kind = AudioVisualizeOptions['kind'];
const SIZES = ['1920x480', '1280x720', '1080x1080', '1080x1920'];

export function VisualizePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [kind, setKind] = useState<Kind>(D.kind);
  const [size, setSize] = useState(`${D.width}x${D.height}`);
  const [color, setColor] = useState(D.color);
  const [background, setBackground] = useState(D.background);
  const [wave, setWave] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.previewWaveform(file.path, 600, 150).then((u) => { if (alive) setWave(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [file.path]);

  const [width, height] = size.split('x').map(Number);
  return (
    <Panel title="Visualize audio" onBack={onBack} onClose={onClose} applyLabel="Create"
      onReset={() => { setKind(D.kind); setSize(`${D.width}x${D.height}`); setColor(D.color); setBackground(D.background); }}
      onApply={() => onApply({ kind, width, height, color, background } satisfies AudioVisualizeOptions)}>
      <div className="viz-preview" style={{ background }}>
        {wave && <img src={wave} alt="Waveform preview" style={{ opacity: kind === 'spectrogram-png' ? 0.35 : 1 }} />}
        <span className="viz-preview__tag">{kind === 'spectrogram-png' ? 'Spectrogram' : kind === 'waveform-mp4' ? 'Animated waveform' : 'Waveform'}</span>
      </div>
      <Row label="Output">
        <Segmented<Kind> label="Output" value={kind} onChange={setKind}
          options={[{ value: 'waveform-png', label: 'Waveform image' }, { value: 'spectrogram-png', label: 'Spectrogram' }, { value: 'waveform-mp4', label: 'Waveform video' }]} />
      </Row>
      <Row label="Size">
        <Select<string> label="Size" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: s.replace('x', '×') }))} />
      </Row>
      {kind !== 'spectrogram-png' && (
        <>
          <Row label="Colour"><ColorSwatches label="Waveform colour" value={color} onChange={setColor} options={['#FF5A1F', '#1F1F1F', '#FFFFFF', '#2B6CFF']} /></Row>
          <Row label="Background"><ColorSwatches label="Background colour" value={background} onChange={setBackground} options={['#FFFFFF', '#000000', '#F3F3F2']} /></Row>
        </>
      )}
    </Panel>
  );
}
