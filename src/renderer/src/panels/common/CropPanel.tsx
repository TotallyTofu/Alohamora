import { useState } from 'react';
import { ASPECTS, FULL_RECT, clampNormRect, fitAspect, toPixelRect, type NormRect } from '@shared/geometry';
import { Button } from '../../components/Button';
import { CropBox } from '../../components/CropBox';
import { Icon } from '../../components/Icon';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { Select } from '../../components/Select';
import { Slider } from '../../components/Slider';
import { TimeRange } from '../../components/TimeRange';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

const MARGIN = 48;
const SMALL = { width: 440, height: 660, preview: 320 };
const LARGE = { width: 640, height: 860, preview: 520 };

/** Crop UI shared by tools. Video mode (Task 7.6); Task 9.3 adds the image mode. */
export function CropPanel({ files, onApply, onBack, onClose, title = 'Crop Video' }: ToolPanelProps & { title?: string }) {
  const file = files[0];
  const w = file.width ?? 1;
  const h = file.height ?? 1;
  const frameAspect = w / h;
  const [rect, setRect] = useState<NormRect>(FULL_RECT);
  const [aspectKey, setAspectKey] = useState('free');
  const [time, setTime] = useState(0);
  const [big, setBig] = useState(false);

  const ratio = aspectKey === 'free' ? null : aspectKey === 'original' ? frameAspect : (ASPECTS.find((a) => a.key === aspectKey)?.ratio ?? null);
  const px = toPixelRect(rect, w, h, true);

  const recenter = (r: NormRect, nw: number, nh: number): NormRect =>
    clampNormRect({ x: r.x + r.w / 2 - nw / 2, y: r.y + r.h / 2 - nh / 2, w: nw, h: nh });

  const chooseAspect = (key: string): void => {
    setAspectKey(key);
    if (key === 'original') setRect(FULL_RECT);
    else {
      const r = ASPECTS.find((a) => a.key === key)?.ratio;
      if (r) setRect(fitAspect(r, w, h));
    }
  };
  const setWidth = (pct: number): void => {
    let nw = pct / 100;
    let nh = rect.h;
    if (ratio !== null) {
      nh = (nw * frameAspect) / ratio;
      if (nh > 1) { nh = 1; nw = ratio / frameAspect; }
    }
    setRect(recenter(rect, nw, nh));
  };
  const setHeight = (pct: number): void => setRect(recenter(rect, rect.w, pct / 100));
  const reset = (): void => { setRect(FULL_RECT); setAspectKey('free'); };

  const toggleBig = (): void => {
    const next = !big;
    setBig(next);
    const s = next ? LARGE : SMALL;
    void api.resizeOverlay({ width: s.width + MARGIN, height: s.height + MARGIN, anchor: 'center' });
  };

  return (
    <Panel title={title} onBack={onBack} onClose={onClose} applyLabel="Apply" onApply={() => onApply({ rect })}>
      <MediaPreview file={file} time={time} onTime={setTime} maxHeight={big ? LARGE.preview : SMALL.preview}>
        <CropBox rect={rect} onChange={setRect} aspect={ratio} frameAspect={frameAspect} />
        <button type="button" className="media__expand" aria-label={big ? 'Smaller preview' : 'Larger preview'} onClick={toggleBig}>
          <Icon name="expand" size={16} />
        </button>
      </MediaPreview>
      <Row label="Aspect ratio">
        <Select<string> label="Aspect ratio" value={aspectKey} onChange={chooseAspect}
          options={ASPECTS.map((a) => ({ value: a.key, label: a.label }))} />
      </Row>
      <div className="row">
        <Button variant="soft" onClick={reset}>Reset</Button>
        <span className="panel__readout">{px.w.toLocaleString()} × {px.h.toLocaleString()} px</span>
      </div>
      <Slider label="Width" value={Math.round(rect.w * 100)} min={10} max={100} onChange={setWidth} format={(v) => `${v}%`} />
      <Slider label="Height" value={Math.round(rect.h * 100)} min={10} max={100} onChange={setHeight} format={(v) => `${v}%`} />
      {ratio !== null && <p className="card-note">The ratio is locked — changing the width updates the height.</p>}
      <TimeRange duration={file.durationSec ?? 0} playhead={time} onSeek={setTime} />
    </Panel>
  );
}
