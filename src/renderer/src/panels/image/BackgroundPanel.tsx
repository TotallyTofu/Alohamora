import { useState } from 'react';
import { TOOL_DEFAULTS, type ImageBackgroundOptions } from '@shared/toolOptions';
import { ColorSwatches } from '../../components/ColorSwatches';
import { ImagePreview } from '../../components/ImagePreview';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['image.background'];
type Kind = ImageBackgroundOptions['kind'];
type Aspect = ImageBackgroundOptions['aspect'];

const PRESETS: Array<{ name: string; colors: [string, string] }> = [
  { name: 'Sunrise', colors: ['#FFB38A', '#FF5A1F'] }, { name: 'Ocean', colors: ['#8EC5FC', '#3B6CFF'] },
  { name: 'Mint', colors: ['#C3F0D6', '#2BB673'] }, { name: 'Dusk', colors: ['#F7CAC9', '#7F7FD5'] },
  { name: 'Silver', colors: ['#F5F5F5', '#D6D6D6'] }, { name: 'Night', colors: ['#434343', '#000000'] }
];
const SOLIDS = ['#FFFFFF', '#F3F3F2', '#1F1F1F', '#FF5A1F', '#2B6CFF', '#2BB673'];

export function BackgroundPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [o, setO] = useState<ImageBackgroundOptions>({ ...D, gradient: [...D.gradient] as [string, string] });
  const set = <K extends keyof ImageBackgroundOptions>(key: K, value: ImageBackgroundOptions[K]): void => setO((cur) => ({ ...cur, [key]: value }));
  return (
    <Panel title="Add a background" onBack={onBack} onClose={onClose} applyLabel="Save"
      onReset={() => setO({ ...D, gradient: [...D.gradient] as [string, string] })} onApply={() => onApply({ ...o })}>
      <div className="twocol">
        <ImagePreview maxHeight={420} request={{ op: 'background', path: file.path, maxSide: 700, options: { ...o } }} />
        <div className="twocol__side">
          <Segmented<Kind> label="Type" value={o.kind} onChange={(v) => set('kind', v)}
            options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'blur', label: 'Blur' }]} />
          {o.kind === 'gradient' && (
            <div className="swatches" role="radiogroup" aria-label="Gradient presets">
              {PRESETS.map((p) => {
                const on = p.colors[0] === o.gradient[0] && p.colors[1] === o.gradient[1];
                return (
                  <button key={p.name} type="button" role="radio" aria-checked={on} aria-label={p.name} title={p.name}
                    className={`gradswatch${on ? ' is-on' : ''}`} style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
                    onClick={() => set('gradient', [...p.colors] as [string, string])} />
                );
              })}
            </div>
          )}
          {o.kind === 'solid' && (
            <div className="panel__line">
              <ColorSwatches label="Background colour" value={o.color} options={SOLIDS} onChange={(c) => set('color', c)} />
              <input type="color" aria-label="Custom colour" value={o.color.length === 7 ? o.color : '#ffffff'} onChange={(e) => set('color', e.target.value)} />
            </div>
          )}
          <Slider label="Padding" value={o.paddingPct} min={0} max={30} onChange={(v) => set('paddingPct', v)} format={(v) => `${v}%`} />
          <Slider label="Corners" value={o.radiusPct} min={0} max={20} onChange={(v) => set('radiusPct', v)} format={(v) => `${v}%`} />
          <Row label="Shadow"><Toggle label="Shadow" checked={o.shadow} onChange={(v) => set('shadow', v)} /></Row>
          <Row label="Canvas">
            <Segmented<Aspect> label="Canvas" value={o.aspect} onChange={(v) => set('aspect', v)}
              options={(['auto', '1:1', '4:5', '16:9', '9:16'] as Aspect[]).map((a) => ({ value: a, label: a === 'auto' ? 'Auto' : a }))} />
          </Row>
        </div>
      </div>
    </Panel>
  );
}
