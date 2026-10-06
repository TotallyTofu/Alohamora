import { useState } from 'react';
import type { NormRect } from '@shared/geometry';
import { formatTimecode } from '@shared/time';
import type { RedactRegion, VideoRedactOptions } from '@shared/toolOptions';
import { MediaPreview } from '../../components/MediaPreview';
import { Panel, Row } from '../../components/Panel';
import { RectEditor, type EditableRect } from '../../components/RectEditor';
import { Segmented } from '../../components/Segmented';
import { TimeRange } from '../../components/TimeRange';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

type Style = RedactRegion['style'];
interface Box { id: string; rect: NormRect; style: Style; startSec?: number; endSec?: number }
const STYLE_LABEL: Record<Style, string> = { blur: 'Blur', pixelate: 'Pixelate', black: 'Black' };

export function RedactPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const duration = file.durationSec ?? 0;
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const frameAspect = (file.width ?? 1) / (file.height ?? 1);
  const sel = boxes.find((b) => b.id === selected) ?? null;

  const onRects = (rects: EditableRect[]): void => {
    setBoxes((cur) => rects.map((r) => {
      const old = cur.find((b) => b.id === r.id);
      return old ? { ...old, rect: r.rect } : { id: r.id, rect: r.rect, style: 'blur' };
    }));
  };
  const patch = (id: string, p: Partial<Box>): void => setBoxes((cur) => cur.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const timed = (b: Box): boolean => b.startSec !== undefined && b.endSec !== undefined;
  const chip = (b: Box, i: number): string =>
    `Box ${i + 1} · ${STYLE_LABEL[b.style]} · ${timed(b) ? `${formatTimecode(b.startSec ?? 0)}–${formatTimecode(b.endSec ?? 0)}` : 'whole video'}`;

  return (
    <Panel title="Redact video" onBack={onBack} onClose={onClose} applyLabel="Redact" applyDisabled={boxes.length === 0}
      onReset={() => { setBoxes([]); setSelected(null); }}
      onApply={() => onApply({
        regions: boxes.map((b) => ({ rect: b.rect, style: b.style, startSec: b.startSec, endSec: b.endSec }))
      } satisfies VideoRedactOptions)}>
      <MediaPreview file={file} time={time} onTime={setTime} maxHeight={340}>
        <RectEditor rects={boxes.map((b) => ({ id: b.id, rect: b.rect }))} selected={selected} onSelect={setSelected} onChange={onRects}
          frameAspect={frameAspect} labelOf={(id) => `Box ${boxes.findIndex((b) => b.id === id) + 1}`}
          classOf={(id) => `rectedit__rect--${boxes.find((b) => b.id === id)?.style ?? 'blur'}`} />
      </MediaPreview>
      <p className="card-note">Drag on the video to draw a box.</p>
      {boxes.length > 0 && (
        <ul className="chiplist">
          {boxes.map((b, i) => (
            <li key={b.id}>
              <button type="button" className={`chip chip--button${b.id === selected ? ' is-on' : ''}`} onClick={() => setSelected(b.id)}>
                {chip(b, i)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sel && (
        <>
          <Row label="Style">
            <Segmented<Style> label="Style" value={sel.style} onChange={(style) => patch(sel.id, { style })}
              options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }, { value: 'black', label: 'Black' }]} />
          </Row>
          <Row label="Only between">
            <Toggle label="Only between two times" checked={timed(sel)}
              onChange={(on) => patch(sel.id, on ? { startSec: 0, endSec: duration } : { startSec: undefined, endSec: undefined })} />
          </Row>
          {timed(sel) && (
            <TimeRange duration={duration} playhead={time} onSeek={setTime} range={{ start: sel.startSec ?? 0, end: sel.endSec ?? duration }}
              onRange={(startSec, endSec) => patch(sel.id, { startSec, endSec })} />
          )}
        </>
      )}
    </Panel>
  );
}
