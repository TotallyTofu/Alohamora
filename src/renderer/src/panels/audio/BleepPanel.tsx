import { useEffect, useState } from 'react';
import { formatTimecode } from '@shared/time';
import { TOOL_DEFAULTS, type AudioBleepOptions } from '@shared/toolOptions';
import { Button, IconButton } from '../../components/Button';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import { Waveform } from '../../components/Waveform';
import { useAudio } from '../../lib/useAudio';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['audio.bleep'];
interface Item { id: string; start: number; end: number }
type Sound = AudioBleepOptions['sound'];
const typing = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

/** A short local WebAudio tone so the user can hear the pitch. Nothing leaves the computer. */
function previewTone(frequency: number): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  gain.gain.value = 0.2;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => { void ctx.close(); };
}

export function BleepPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const duration = file.durationSec ?? 0;
  const audio = useAudio(file.path);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound>(D.sound);
  const [frequency, setFrequency] = useState(D.frequency);

  const add = (): void => {
    const start = Math.min(audio.time, Math.max(0, duration - 0.1));
    const id = crypto.randomUUID();
    setItems((l) => [...l, { id, start, end: Math.min(duration, start + 0.5) }].sort((a, b) => a.start - b.start));
    setSelected(id);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!typing(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'b' || e.key === 'B')) add();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sel = items.find((i) => i.id === selected) ?? null;
  return (
    <Panel title="Bleep audio" onBack={onBack} onClose={onClose} applyLabel="Bleep" applyDisabled={items.length === 0}
      onReset={() => { setItems([]); setSelected(null); setSound(D.sound); setFrequency(D.frequency); }}
      onApply={() => onApply({
        ranges: items.map((i) => ({ startSec: i.start, endSec: i.end })), sound, frequency
      } satisfies AudioBleepOptions)}>
      <Waveform file={file} audio={audio} onSeek={audio.seek}
        marks={items.map((i) => ({ start: i.start, end: i.end }))}
        range={sel ? { start: sel.start, end: sel.end } : undefined}
        onRange={sel ? (start, end) => setItems((l) => l.map((i) => (i.id === sel.id ? { ...i, start, end } : i))) : undefined} />
      <div className="panel__line">
        <Button variant="soft" onClick={add}>Add bleep at playhead <kbd>B</kbd></Button>
        {sel && <Button variant="ghost" onClick={() => audio.playRange(Math.max(0, sel.start - 0.5), Math.min(duration, sel.end + 0.5))}>Play around it</Button>}
      </div>
      <ul className="chiplist">
        {items.map((i) => (
          <li key={i.id} className={`chip${i.id === selected ? ' chip--on' : ''}`}>
            <button type="button" className="chip__text" onClick={() => setSelected(i.id)}>{formatTimecode(i.start)} – {formatTimecode(i.end)}</button>
            <IconButton label="Remove" icon="close" onClick={() => { setItems((l) => l.filter((x) => x.id !== i.id)); if (selected === i.id) setSelected(null); }} />
          </li>
        ))}
      </ul>
      <Row label="Sound">
        <Segmented<Sound> label="Sound" value={sound} onChange={setSound} options={[{ value: 'beep', label: 'Beep' }, { value: 'silence', label: 'Silence' }]} />
      </Row>
      {sound === 'beep' && (
        <>
          <Slider label="Tone" value={frequency} min={400} max={2000} step={50} onChange={setFrequency} format={(v) => `${v} Hz`} />
          <div><Button variant="soft" onClick={() => previewTone(frequency)}>Preview tone</Button></div>
        </>
      )}
    </Panel>
  );
}
