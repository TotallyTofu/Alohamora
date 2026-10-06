import { useState } from 'react';
import { formatBytes } from '@shared/time';
import { TOOL_DEFAULTS, type AudioCompressOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['audio.compress'];
type Format = AudioCompressOptions['format'];
const LOSSLESS = ['wav', 'flac', 'aiff'];

export function AudioCompressPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [bitrate, setBitrate] = useState<number>(D.bitrateKbps);
  const [format, setFormat] = useState<Format>(D.format);
  const [mono, setMono] = useState(D.mono);
  const keepLabel = file.fmt && LOSSLESS.includes(file.fmt) ? 'Keep (MP3)' : `Keep (${file.fmt?.toUpperCase() ?? 'same'})`;
  const info = [
    formatBytes(file.size), file.sampleRate ? `${(file.sampleRate / 1000).toFixed(1)} kHz` : '',
    file.channels ? (file.channels === 1 ? 'mono' : file.channels === 2 ? 'stereo' : `${file.channels} ch`) : ''
  ].filter(Boolean).join(' · ');
  return (
    <Panel title="Compress audio" onBack={onBack} onClose={onClose} applyLabel="Compress"
      onReset={() => { setBitrate(D.bitrateKbps); setFormat(D.format); setMono(D.mono); }}
      onApply={() => onApply({ bitrateKbps: bitrate, format, mono } satisfies AudioCompressOptions)}>
      <p className="panel__info">Current: {info}</p>
      <Row label="Bitrate">
        <Segmented<number> label="Bitrate (kbps)" value={bitrate} onChange={setBitrate}
          options={[64, 96, 128, 160, 192, 256].map((v) => ({ value: v, label: String(v) }))} />
      </Row>
      <Row label="Format">
        <Select<Format> label="Format" value={format} onChange={setFormat}
          options={[{ value: 'keep', label: keepLabel }, { value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A' }, { value: 'opus', label: 'Opus' }]} />
      </Row>
      <Row label="Mono" hint="Halves the size. Good for speech.">
        <Toggle label="Mono" checked={mono} onChange={setMono} />
      </Row>
    </Panel>
  );
}
