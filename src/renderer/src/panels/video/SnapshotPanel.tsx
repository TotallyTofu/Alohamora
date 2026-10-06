import { useState } from 'react';
import { TOOL_DEFAULTS, type VideoSnapshotOptions } from '@shared/toolOptions';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { TimeRange } from '../../components/TimeRange';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['video.snapshot'];
type Mode = VideoSnapshotOptions['mode'];
type Format = VideoSnapshotOptions['format'];

export function SnapshotPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [time, setTime] = useState(0);
  const [mode, setMode] = useState<Mode>(D.mode);
  const [every, setEvery] = useState(String(D.everySec));
  const [format, setFormat] = useState<Format>(D.format);
  const everySec = Math.max(0.1, Number(every) || D.everySec);
  return (
    <Panel title="Save frames" onBack={onBack} onClose={onClose} applyLabel={mode === 'single' ? 'Save frame' : 'Save frames'}
      onApply={() => onApply({ mode, timeSec: time, everySec, format } satisfies VideoSnapshotOptions)}>
      <MediaPreview file={file} time={time} onTime={setTime} maxHeight={300} />
      <TimeRange duration={file.durationSec ?? 0} playhead={time} onSeek={setTime} />
      <Row label="Save">
        <Segmented<Mode> label="Save" value={mode} onChange={setMode}
          options={[{ value: 'single', label: 'This frame' }, { value: 'every', label: 'Every N seconds' }]} />
      </Row>
      {mode === 'every' && (
        <Row label="Seconds between frames">
          <div className="panel__small"><TextField label="Seconds between frames" type="number" value={every} onChange={setEvery} /></div>
        </Row>
      )}
      <Row label="Format">
        <Segmented<Format> label="Format" value={format} onChange={setFormat}
          options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]} />
      </Row>
    </Panel>
  );
}
