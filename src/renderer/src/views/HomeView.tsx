import { useEffect, useMemo, useState } from 'react';
import { FORMATS } from '@shared/formats';
import { toolsFor } from '@shared/tools';
import type { Capabilities, Fmt } from '@shared/types';
import type { WheelItem } from '@shared/wheelItems';
import { DropZone } from '../components/DropZone';
import { Keycap } from '../components/Keycap';
import { Wheel } from '../components/Wheel/Wheel';
import { api } from '../lib/api';
import { useNativeDrop } from '../lib/nativeDrop';
import { altKeyName, altKeycap } from '../lib/platform';
import { ActivityList } from './ActivityList';

const DEMO_FORMATS: Fmt[] = ['mp4', 'mkv', 'webm', 'avi', 'wmv', 'gif', 'mp3'];

/** Cycles 0..n-1 forever; the demo wheels use it to highlight one slice at a time. */
function useCycle(n: number, ms: number, start: number): number {
  const [i, setI] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return i;
}

function DemoWheel({ items, active, label }: { items: WheelItem[]; active: number; label: string }) {
  return (
    <div className="hint-wheel" aria-hidden="true">
      <Wheel demo items={items} active={active} hubLabel={label} />
    </div>
  );
}

export function HomeView() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => { void api.getCapabilities().then(setCaps); }, []);

  const formatItems = useMemo<WheelItem[]>(() => DEMO_FORMATS.map((t) => ({
    key: `to-${t}`, label: FORMATS[t].label, kind: 'format', target: t, needsOptions: false
  })), []);
  const toolItems = useMemo<WheelItem[]>(() => toolsFor('video', 1).map((t) => ({
    key: t.id, label: t.label, icon: t.icon, kind: 'tool', toolId: t.id, needsOptions: !t.instant
  })), []);

  const fi = useCycle(formatItems.length, 1200, 4);
  const ti = useCycle(toolItems.length, 1200, 0);
  const alt = altKeycap();

  // A drop anywhere on this page opens the wheel; Alt (Option) held = the Tools ring.
  useNativeDrop((e, paths) => {
    if (e.phase === 'drop' && paths.length) void api.openOverlay(paths, e.alt ? 'tools' : 'convert');
  });

  return (
    <div className="home">
      <h1 className="home__title">Drop a file. Pick a slice.</h1>
      <p className="home__sub">
        Convert and edit images, video, audio, PDFs and subtitles — offline, on this computer. Nothing is uploaded.
      </p>
      {caps && !caps.ffmpeg && (
        <div className="banner" role="alert">
          FFmpeg was not found — video and audio are disabled. Run <code>npm run fetch-binaries</code>.
        </div>
      )}
      <DropZone />
      <section className="hints" aria-label="How it works">
        <div className="hint-card">
          <div className="hint-card__keys"><Keycap glyph="⇧" label="shift" /></div>
          <p className="hint-card__title">Convert formats</p>
          <DemoWheel items={formatItems} active={fi} label={formatItems[fi].label} />
          <p className="hint-card__caption">Convert to {formatItems[fi].label}</p>
        </div>
        <div className="hint-card">
          <div className="hint-card__keys">
            <Keycap glyph="⇧" label="shift" />
            <span className="hint-card__plus">+</span>
            <Keycap glyph={alt.glyph} label={alt.label} />
          </div>
          <p className="hint-card__title">Advanced tools</p>
          <DemoWheel items={toolItems} active={ti} label={toolItems[ti].label} />
          <p className="hint-card__caption">{toolItems[ti].label}</p>
        </div>
      </section>
      <p className="home__tip">
        In this window: drop = convert · <kbd>{altKeyName()}</kbd> + drop = tools · <kbd>Tab</kbd> switches inside the wheel
      </p>
      <ActivityList />
    </div>
  );
}
