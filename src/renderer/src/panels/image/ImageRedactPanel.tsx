import { useState } from 'react';
import type { NormRect } from '@shared/geometry';
import type { ImageRedactOptions } from '@shared/toolOptions';
import { ImagePreview } from '../../components/ImagePreview';
import { Panel, Row } from '../../components/Panel';
import { RectEditor, type EditableRect } from '../../components/RectEditor';
import { Segmented } from '../../components/Segmented';
import type { ToolPanelProps } from '..';

type Style = ImageRedactOptions['regions'][number]['style'];
interface Box { id: string; rect: NormRect; style: Style }
const STYLE_LABEL: Record<Style, string> = { blur: 'Blur', pixelate: 'Pixelate', black: 'Black' };

export function ImageRedactPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [aspect, setAspect] = useState((file.width ?? 1) / (file.height ?? 1));
  const sel = boxes.find((b) => b.id === selected) ?? null;

  const onRects = (rects: EditableRect[]): void => {
    setBoxes((cur) => rects.map((r) => {
      const old = cur.find((b) => b.id === r.id);
      return old ? { ...old, rect: r.rect } : { id: r.id, rect: r.rect, style: 'blur' };
    }));
  };
  return (
    <Panel title="Redact image" onBack={onBack} onClose={onClose} applyLabel="Redact" applyDisabled={boxes.length === 0}
      onReset={() => { setBoxes([]); setSelected(null); }}
      onApply={() => onApply({ regions: boxes.map((b) => ({ rect: b.rect, style: b.style })) } satisfies ImageRedactOptions)}>
      <ImagePreview maxHeight={360} request={{ op: 'none', path: file.path, maxSide: 1200 }} onLoaded={(r) => setAspect(r.width / r.height)}>
        <RectEditor rects={boxes.map((b) => ({ id: b.id, rect: b.rect }))} selected={selected} onSelect={setSelected} onChange={onRects}
          frameAspect={aspect} labelOf={(id) => `Box ${boxes.findIndex((b) => b.id === id) + 1}`}
          classOf={(id) => `rectedit__rect--${boxes.find((b) => b.id === id)?.style ?? 'blur'}`} />
      </ImagePreview>
      <p className="card-note">Drag on the picture to draw a box. Redaction is permanent and removes photo metadata.</p>
      {boxes.length > 0 && (
        <ul className="chiplist">
          {boxes.map((b, i) => (
            <li key={b.id}>
              <button type="button" className={`chip chip--button${b.id === selected ? ' is-on' : ''}`} onClick={() => setSelected(b.id)}>
                Box {i + 1} · {STYLE_LABEL[b.style]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sel && (
        <Row label="Style">
          <Segmented<Style> label="Style" value={sel.style} onChange={(style) => setBoxes((cur) => cur.map((b) => (b.id === sel.id ? { ...b, style } : b)))}
            options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }, { value: 'black', label: 'Black' }]} />
        </Row>
      )}
    </Panel>
  );
}
