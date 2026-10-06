import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export interface AudioApi {
  ready: boolean;
  playing: boolean;
  time: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  /** Play from a to b, then stop. */
  playRange: (a: number, b: number) => void;
}

/** One HTMLAudioElement for a local file (via the kfile:// preview URL). */
export function useAudio(path: string): AudioApi {
  const el = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let alive = true;
    const a = new Audio();
    a.preload = 'auto';
    el.current = a;
    setReady(false);
    setPlaying(false);
    setTime(0);
    a.addEventListener('canplay', () => setReady(true));
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('timeupdate', () => {
      setTime(a.currentTime);
      if (stopAt.current !== null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null; }
    });
    void api.previewMedia(path).then((r) => { if (alive) a.src = r.url; }).catch(() => undefined);
    return () => { alive = false; a.pause(); a.removeAttribute('src'); a.load(); el.current = null; };
  }, [path]);

  const play = useCallback(() => { stopAt.current = null; void el.current?.play(); }, []);
  const pause = useCallback(() => { el.current?.pause(); }, []);
  const toggle = useCallback(() => { const a = el.current; if (a) { if (a.paused) { stopAt.current = null; void a.play(); } else a.pause(); } }, []);
  const seek = useCallback((t: number) => { setTime(t); if (el.current) el.current.currentTime = t; }, []);
  const playRange = useCallback((s: number, e: number) => {
    const a = el.current;
    if (!a) return;
    a.currentTime = s;
    stopAt.current = e;
    void a.play();
  }, []);

  return { ready, playing, time, play, pause, toggle, seek, playRange };
}
