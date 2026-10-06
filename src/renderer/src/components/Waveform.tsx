import { useEffect, useState, type PointerEvent } from 'react';
import type { FileInfo } from '@shared/types';
import { api } from '../lib/api';
import type { AudioApi } from '../lib/useAudio';
import { IconButton } from './Button';
import { TimeRange } from './TimeRange';

export interface WaveformProps {
  file: FileInfo;
  audio: AudioApi;
  onSeek: (t: number) => void;
  range?: { start: number; end: number };
  onRange?: (start: number, end: number) => void;
  marks?: Array<{ start: number; end: number }>;
  height?: number;
}

const isTyping = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

/** Waveform picture with selection / mark shades, a playhead, a play button and a TimeRange underneath. */
export function Waveform({ file, audio, onSeek, range, onRange, marks, height = 96 }: WaveformProps) {
  const [url, setUrl] = useState<string | null>(null);
  const duration = file.durationSec ?? 0;
  const time = audio.time;
  const pct = (t: number): string => `${Math.min(Math.max(t / (duration || 1), 0), 1) * 100}%`;

  useEffect(() => {
    let alive = true;
    setUrl(null);
    void api.previewWaveform(file.path, 800, height).then((u) => { if (alive) setUrl(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [file.path, height]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isTyping(e.target)) { e.preventDefault(); audio.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const click = (e: PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(duration, Math.max(0, ((e.clientX - r.left) / r.width) * duration)));
  };

  return (
    <div className="wave">
      <div className="wave__img" style={{ height }} onPointerDown={click}>
        {url && <img src={url} alt="" draggable={false} />}
        {marks?.map((m, i) => <div key={i} className="wave__mark" style={{ left: pct(m.start), width: `calc(${pct(m.end)} - ${pct(m.start)})` }} />)}
        {range && <div className="wave__range" style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }} />}
        <div className="wave__head" style={{ left: pct(time) }} />
        <div className="wave__play">
          <IconButton label={audio.playing ? 'Pause' : 'Play'} icon={audio.playing ? 'pause' : 'play'} onClick={audio.toggle} disabled={!audio.ready} />
        </div>
      </div>
      <TimeRange duration={duration} playhead={time} onSeek={onSeek} range={range} onRange={onRange} marks={marks} />
    </div>
  );
}
