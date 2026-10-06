import { useEffect, useState } from 'react';
import { formatTimecode } from '@shared/time';
import type { AudioTrimOptions } from '@shared/toolOptions';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { Slider } from '../../components/Slider';
import { Waveform } from '../../components/Waveform';
import { useAudio } from '../../lib/useAudio';
import type { ToolPanelProps } from '..';

const typing = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export function AudioTrimPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const duration = file.durationSec ?? 0;
  const audio = useAudio(file.path);
  const [range, setRange] = useState({ start: 0, end: duration });
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  const setStart = (): void => setRange((r) => ({ start: Math.min(audio.time, r.end - 0.1), end: r.end }));
  const setEnd = (): void => setRange((r) => ({ start: r.start, end: Math.max(audio.time, r.start + 0.1) }));
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
    <Panel title="Trim audio" onBack={onBack} onClose={onClose} applyLabel="Trim"
      onReset={() => { setRange({ start: 0, end: duration }); setFadeIn(0); setFadeOut(0); }}
      onApply={() => onApply({ startSec: range.start, endSec: range.end, fadeInSec: fadeIn, fadeOutSec: fadeOut } satisfies AudioTrimOptions)}>
      <Waveform file={file} audio={audio} onSeek={audio.seek} range={range} onRange={(start, end) => setRange({ start, end })} />
      <div className="panel__line">
        <Button variant="soft" onClick={() => audio.playRange(range.start, range.end)}>Play selection</Button>
        <Button variant="soft" onClick={setStart}>Set start <kbd>I</kbd></Button>
        <Button variant="soft" onClick={setEnd}>Set end <kbd>O</kbd></Button>
        <span className="panel__readout">Keeps {formatTimecode(keeps)}</span>
      </div>
      <Slider label="Fade in" value={fadeIn} min={0} max={5} step={0.1} onChange={setFadeIn} format={(v) => `${v.toFixed(1)}s`} />
      <Slider label="Fade out" value={fadeOut} min={0} max={5} step={0.1} onChange={setFadeOut} format={(v) => `${v.toFixed(1)}s`} />
    </Panel>
  );
}
