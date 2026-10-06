import { useState } from 'react';
import { TOOL_DEFAULTS, type ImageResizeOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['image.resize'];
type Mode = ImageResizeOptions['mode'];

export function ResizePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const ow = file.width ?? 1;
  const oh = file.height ?? 1;
  const [mode, setMode] = useState<Mode>(D.mode);
  const [percent, setPercent] = useState(D.percent);
  const [width, setWidth] = useState(String(ow));
  const [height, setHeight] = useState(String(oh));
  const [keepAspect, setKeepAspect] = useState(D.keepAspect);

  const onWidth = (v: string): void => {
    setWidth(v);
    const n = Number(v);
    if (keepAspect && n > 0) setHeight(String(Math.max(1, Math.round((n * oh) / ow))));
  };
  const onHeight = (v: string): void => {
    setHeight(v);
    const n = Number(v);
    if (keepAspect && n > 0) setWidth(String(Math.max(1, Math.round((n * ow) / oh))));
  };

  const nw = mode === 'percent' ? Math.round((ow * percent) / 100) : Number(width) || 0;
  const nh = mode === 'percent' ? Math.round((oh * percent) / 100) : Number(height) || 0;
  return (
    <Panel title="Resize image" onBack={onBack} onClose={onClose}
      applyLabel={files.length > 1 ? `Resize ${files.length} images` : 'Resize'} applyDisabled={nw <= 0 || nh <= 0}
      onReset={() => { setMode(D.mode); setPercent(D.percent); setWidth(String(ow)); setHeight(String(oh)); setKeepAspect(D.keepAspect); }}
      onApply={() => onApply({ mode, percent, width: Number(width) || 0, height: Number(height) || 0, keepAspect } satisfies ImageResizeOptions)}>
      <Row label="Resize by">
        <Segmented<Mode> label="Resize by" value={mode} onChange={setMode} options={[{ value: 'percent', label: 'Percent' }, { value: 'pixels', label: 'Pixels' }]} />
      </Row>
      {mode === 'percent'
        ? <Slider label="Scale" value={percent} min={5} max={200} onChange={setPercent} format={(v) => `${v}%`} />
        : (
          <>
            <Row label="Width"><div className="panel__small"><TextField label="Width in pixels" type="number" value={width} onChange={onWidth} /></div></Row>
            <Row label="Height"><div className="panel__small"><TextField label="Height in pixels" type="number" value={height} onChange={onHeight} /></div></Row>
            <Row label="Lock aspect ratio"><Toggle label="Lock aspect ratio" checked={keepAspect} onChange={setKeepAspect} /></Row>
          </>
        )}
      <p className="size-readout">{ow}×{oh} → {nw}×{nh}</p>
    </Panel>
  );
}
