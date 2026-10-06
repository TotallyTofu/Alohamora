import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FileInfo } from '@shared/types';
import { api } from '../lib/api';
import { Icon } from './Icon';

export interface MediaPreviewProps {
  file: FileInfo;
  time: number;
  onTime: (t: number) => void;
  maxHeight?: number;
  /** Overlays (CropBox / RectEditor) placed exactly over the picture. */
  children?: ReactNode;
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

export function MediaPreview({ file, time, onTime, maxHeight = 300, children }: MediaPreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setBroken(false);
    void api.previewMedia(file.path).then((r) => { if (alive) setSrc(r.url); }).catch(() => { if (alive) setBroken(true); });
    return () => { alive = false; };
  }, [file.path]);

  // prop → element
  useEffect(() => {
    const v = video.current;
    if (v && Math.abs(v.currentTime - time) > 0.04) v.currentTime = time;
  }, [time, src]);

  // fallback: still frames when the <video> cannot play the file
  useEffect(() => {
    if (!broken) return;
    let alive = true;
    const t = setTimeout(() => {
      void api.previewFrame(file.path, time, 960).then((d) => { if (alive) setFrame(d); }).catch(() => undefined);
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [broken, time, file.path]);

  const toggle = (): void => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isTyping(e.target) && !broken) { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = file.width && file.height ? file.width / file.height : 16 / 9;
  // Width is the largest that fits both the card and `maxHeight`; the height follows from the aspect ratio.
  return (
    <div className="media" style={{ aspectRatio: String(r), width: `min(100%, ${Math.round(maxHeight * r)}px)` }}>
      {broken
        ? (frame ? <img className="media__el" src={frame} alt="" draggable={false} /> : null)
        : src
          ? (
            <video ref={video} className="media__el" src={src} preload="auto" playsInline muted={false}
              onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onError={() => setBroken(true)} />
          )
          : <div className="media__loading"><span className="spinner" aria-hidden="true" />Preparing preview…</div>}
      <div className="media__overlay">{children}</div>
      {!broken && src && (
        <button type="button" className="media__play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
      )}
    </div>
  );
}
