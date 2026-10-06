import { useEffect, useMemo, useState } from 'react';
import { splitSegments } from '@shared/split';
import { formatTimecode } from '@shared/time';
import { TOOL_DEFAULTS, type VideoSplitOptions } from '@shared/toolOptions';
import { Button, IconButton } from '../../components/Button';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import { TimeRange } from '../../components/TimeRange';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['video.split'];
type Mode = VideoSplitOptions['mode'];
const typing = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export function SplitPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const duration = file.durationSec ?? 0;
  const [time, setTime] = useState(0);
  const [mode, setMode] = useState<Mode>(D.mode);
  const [parts, setParts] = useState(D.parts);
  const [everySec, setEverySec] = useState(30);
  const [times, setTimes] = useState<number[]>([]);
  const [precise, setPrecise] = useState(false);

  const opts: VideoSplitOptions = { mode, times, parts, everySec, precise };
  const segments = useMemo(() => splitSegments(duration, opts), [duration, mode, times, parts, everySec]);
  const marks = segments.slice(1).map((s) => ({ start: s.start, end: s.start + 0.05 }));
  const addCut = (): void => setTimes((t) => [...new Set([...t, Math.round(time * 1000) / 1000])].sort((a, b) => a - b));

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (mode === 'at' && !typing(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C')) addCut();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const everyPresets = [{ value: 30, label: '30 s' }, { value: 60, label: '1 min' }, { value: 300, label: '5 min' }, { value: 600, label: '10 min' }];
  return (
    <Panel title="Split video" onBack={onBack} onClose={onClose} applyLabel="Split" applyDisabled={segments.length < 2}
      onReset={() => { setMode(D.mode); setParts(D.parts); setEverySec(30); setTimes([]); setPrecise(false); }}
      onApply={() => onApply({ ...opts })}>
      <MediaPreview file={file} time={time} onTime={setTime} maxHeight={240} />
      <TimeRange duration={duration} playhead={time} onSeek={setTime} marks={marks} />
      <Row label="Split by">
        <Segmented<Mode> label="Split by" value={mode} onChange={setMode}
          options={[{ value: 'parts', label: 'Into parts' }, { value: 'every', label: 'Every' }, { value: 'at', label: 'At times' }]} />
      </Row>
      {mode === 'parts' && (
        <Row label="Number of parts">
          <div className="stepper">
            <Button variant="soft" onClick={() => setParts((n) => Math.max(2, n - 1))} aria-label="Fewer parts">−</Button>
            <span className="stepper__value">{parts}</span>
            <Button variant="soft" onClick={() => setParts((n) => Math.min(20, n + 1))} aria-label="More parts">+</Button>
          </div>
        </Row>
      )}
      {mode === 'every' && (
        <Row label="Length">
          <Segmented<number> label="Length" value={everySec} onChange={setEverySec} options={everyPresets} />
          <div className="panel__small"><TextField label="Seconds" type="number" value={String(everySec)}
            onChange={(v) => setEverySec(Math.max(1, Number(v) || 1))} /></div>
        </Row>
      )}
      {mode === 'at' && (
        <div className="panel__stack">
          <Button variant="soft" onClick={addCut}>Add cut at playhead <kbd>C</kbd></Button>
          <ul className="chiplist">
            {times.map((t) => (
              <li key={t} className="chip">{formatTimecode(t)}
                <IconButton label={`Remove cut at ${formatTimecode(t)}`} icon="close" onClick={() => setTimes((l) => l.filter((x) => x !== t))} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="panel__readout">Creates {segments.length} file{segments.length === 1 ? '' : 's'}</p>
      <Row label="Precise cuts" hint="Slower; cuts exactly at the marks">
        <Toggle label="Precise cuts" checked={precise} onChange={setPrecise} />
      </Row>
    </Panel>
  );
}
