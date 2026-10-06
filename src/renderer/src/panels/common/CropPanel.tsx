import { useState } from 'react';
import { ASPECTS, FULL_RECT, clampNormRect, fitAspect, toPixelRect, type NormRect } from '@shared/geometry';
import type { ImageCropOptions } from '@shared/toolOptions';
import { Button, IconButton } from '../../components/Button';
import { CropBox } from '../../components/CropBox';
import { Icon } from '../../components/Icon';
import { ImagePreview } from '../../components/ImagePreview';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { Select } from '../../components/Select';
import { Slider } from '../../components/Slider';
import { TimeRange } from '../../components/TimeRange';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

const MARGIN = 48;
const SMALL = { width: 440, preview: 320 };
const LARGE = { width: 640, preview: 520 };

export interface CropPanelProps extends ToolPanelProps {
  kind?: 'video' | 'image';
  title?: string;
  /** Panel height (without the overlay margin); used when the preview is expanded. */
  height?: number;
}

/** Crop UI shared by video (replica of crop-options.png) and images (adds rotate / flip, no timeline). */
export function CropPanel({ files, onApply, onBack, onClose, kind = 'video', title, height = 660 }: CropPanelProps) {
  const file = files[0];
  const isImage = kind === 'image';
  const [rect, setRect] = useState<NormRect>(FULL_RECT);
  const [aspectKey, setAspectKey] = useState('free');
  const [time, setTime] = useState(0);
  const [big, setBig] = useState(false);
  const [rotate, setRotate] = useState<ImageCropOptions['rotate']>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Frame size as displayed after rotation (images) — the crop rect is relative to this.
  const swap = isImage && (rotate === 90 || rotate === 270);
  const w = (swap ? file.height : file.width) ?? 1;
  const h = (swap ? file.width : file.height) ?? 1;
  const frameAspect = w / h;
  const ratio = aspectKey === 'free' ? null : aspectKey === 'original' ? frameAspect : (ASPECTS.find((a) => a.key === aspectKey)?.ratio ?? null);
  const px = toPixelRect(rect, w, h, !isImage);

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
  const reset = (): void => { setRect(FULL_RECT); setAspectKey('free'); setRotate(0); setFlipH(false); setFlipV(false); };
  const turn = (dir: 1 | -1): void => { setRotate((((rotate + dir * 90) % 360 + 360) % 360) as ImageCropOptions['rotate']); setRect(FULL_RECT); setAspectKey('free'); };

  const toggleBig = (): void => {
    const next = !big;
    setBig(next);
    const s = next ? LARGE : SMALL;
    void api.resizeOverlay({ width: s.width + MARGIN, height: (next ? height + 200 : height) + MARGIN, anchor: 'center' });
  };

  const box = <CropBox rect={rect} onChange={setRect} aspect={ratio} frameAspect={frameAspect} />;
  const expand = (
    <button type="button" className="media__expand" aria-label={big ? 'Smaller preview' : 'Larger preview'} onClick={toggleBig}>
      <Icon name="expand" size={16} />
    </button>
  );
  const maxH = big ? LARGE.preview : SMALL.preview;

  return (
    <Panel title={title ?? (isImage ? 'Crop Image' : 'Crop Video')} onBack={onBack} onClose={onClose} applyLabel="Apply"
      onApply={() => onApply(isImage ? { rect, rotate, flipH, flipV } satisfies ImageCropOptions : { rect })}>
      {isImage ? (
        <ImagePreview request={{ op: 'crop', path: file.path, maxSide: 1000, options: { rotate, flipH, flipV } }} maxHeight={maxH}>
          {box}{expand}
        </ImagePreview>
      ) : (
        <MediaPreview file={file} time={time} onTime={setTime} maxHeight={maxH}>{box}{expand}</MediaPreview>
      )}
      {isImage && (
        <div className="iconbar" role="group" aria-label="Rotate and flip">
          <IconButton label="Rotate left" icon="rotateLeft" onClick={() => turn(-1)} />
          <IconButton label="Rotate right" icon="rotateRight" onClick={() => turn(1)} />
          <IconButton label="Flip horizontally" icon="flipH" onClick={() => setFlipH(!flipH)} />
          <IconButton label="Flip vertically" icon="flipV" onClick={() => setFlipV(!flipV)} />
        </div>
      )}
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
      {!isImage && <TimeRange duration={file.durationSec ?? 0} playhead={time} onSeek={setTime} />}
    </Panel>
  );
}
