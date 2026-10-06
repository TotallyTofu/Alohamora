import { useState } from 'react';
import { formatBytes, formatDuration } from '@shared/time';
import { TOOL_DEFAULTS, type VideoCompressOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['video.compress'];
type Preset = VideoCompressOptions['preset'];
type Codec = VideoCompressOptions['codec'];

export function CompressPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [preset, setPreset] = useState<Preset>(D.preset);
  const [maxHeight, setMaxHeight] = useState<string>('0');
  const [codec, setCodec] = useState<Codec>(D.codec);
  const [targetOn, setTargetOn] = useState(false);
  const [targetMb, setTargetMb] = useState('10');
  const short = Math.min(file.width ?? 0, file.height ?? 0);
  const sizes = [2160, 1080, 720, 480].filter((s) => s < short);
  const isWebm = file.fmt === 'webm';
  const mb = Number(targetMb);
  const reset = (): void => { setPreset(D.preset); setMaxHeight('0'); setCodec(D.codec); setTargetOn(false); setTargetMb('10'); };

  return (
    <Panel title="Compress video" onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Compress"
      applyDisabled={targetOn && !(mb > 0)}
      onApply={() => onApply({
        preset, maxHeight: Number(maxHeight) as VideoCompressOptions['maxHeight'], codec: isWebm ? 'h264' : codec,
        targetSizeMb: targetOn ? mb : 0
      } satisfies VideoCompressOptions)}>
      <p className="panel__info">
        {formatBytes(file.size)} · {file.width}×{file.height} · {formatDuration(file.durationSec ?? 0)}
      </p>
      <Row label="Quality">
        <Segmented<Preset> label="Quality" value={preset} onChange={setPreset} disabled={targetOn}
          options={[{ value: 'high', label: 'High' }, { value: 'balanced', label: 'Balanced' }, { value: 'small', label: 'Small' }]} />
      </Row>
      <Row label="Max resolution">
        <Select<string> label="Max resolution" value={maxHeight} onChange={setMaxHeight}
          options={[{ value: '0', label: 'Original' }, ...sizes.map((s) => ({ value: String(s), label: `${s}p` }))]} />
      </Row>
      {!isWebm && (
        <Row label="Codec">
          <Segmented<Codec> label="Codec" value={codec} onChange={setCodec} disabled={targetOn}
            options={[{ value: 'h264', label: 'H.264 (most compatible)' }, { value: 'h265', label: 'H.265 (smaller)' }]} />
        </Row>
      )}
      <Row label="Target size" hint={targetOn ? 'Uses two passes for an accurate size (H.264)' : undefined}>
        <Toggle label="Use a target size" checked={targetOn} onChange={setTargetOn} />
      </Row>
      {targetOn && (
        <Row label="Size (MB)">
          <TextField label="Target size in MB" type="number" value={targetMb} onChange={setTargetMb} />
        </Row>
      )}
    </Panel>
  );
}
