import { useEffect, useState } from 'react';
import { formatTimecode } from '@shared/time';
import { Button } from '../../components/Button';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TimeRange } from '../../components/TimeRange';
import type { ToolPanelProps } from '..';

const typing = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export function TrimPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const duration = file.durationSec ?? 0;
  const [time, setTime] = useState(0);
  const [range, setRange] = useState({ start: 0, end: duration });
  const [precise, setPrecise] = useState(false);

  const setStart = (): void => setRange((r) => ({ start: Math.min(time, r.end - 0.1), end: r.end }));
  const setEnd = (): void => setRange((r) => ({ start: r.start, end: Math.max(time, r.start + 0.1) }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'i' || e.key === 'I') setStart();
      else if (e.key === 'o' || e.key === 'O') setEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keeps = Math.max(0, range.end - range.start);
  return (
    <Panel title="Trim video" onBack={onBack} onClose={onClose} applyLabel="Trim"
      onReset={() => setRange({ start: 0, end: duration })}
      onApply={() => onApply({ startSec: range.start, endSec: range.end, precise })}>
      <MediaPreview file={file} time={time} onTime={setTime} maxHeight={280} />
      <TimeRange duration={duration} playhead={time} onSeek={setTime} range={range}
        onRange={(start, end) => setRange({ start, end })} />
      <div className="panel__line">
        <Button variant="soft" onClick={setStart}>Set start <kbd>I</kbd></Button>
        <Button variant="soft" onClick={setEnd}>Set end <kbd>O</kbd></Button>
        <span className="panel__readout">Keeps {formatTimecode(keeps)}</span>
      </div>
      <Row label="Mode">
        <Segmented<'fast' | 'precise'> label="Mode" value={precise ? 'precise' : 'fast'} onChange={(v) => setPrecise(v === 'precise')}
          options={[{ value: 'fast', label: 'Fast (no quality loss)' }, { value: 'precise', label: 'Precise' }]} />
      </Row>
      {!precise && <p className="card-note">Cuts at the nearest keyframe, so it may start slightly early.</p>}
    </Panel>
  );
}
