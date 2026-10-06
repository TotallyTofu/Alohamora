import { useState } from 'react';
import { DEFAULT_EDIT, type EditParams } from '@shared/toolOptions';
import { ImagePreview } from '../../components/ImagePreview';
import { Panel } from '../../components/Panel';
import { Slider } from '../../components/Slider';
import type { ToolPanelProps } from '..';

type Num = Exclude<keyof EditParams, 'effect'>;
const EFFECTS: Array<{ value: EditParams['effect']; label: string }> = [
  { value: 'none', label: 'None' }, { value: 'bw', label: 'B&W' }, { value: 'sepia', label: 'Sepia' },
  { value: 'vintage', label: 'Vintage' }, { value: 'invert', label: 'Invert' }
];
const GROUPS: Array<{ title: string; items: Array<{ key: Num; label: string; min: number; max: number; step?: number }> }> = [
  { title: 'Light', items: [
    { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05 },
    { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100 }
  ] },
  { title: 'Colour', items: [
    { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
    { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
    { key: 'hue', label: 'Hue', min: -180, max: 180 }
  ] },
  { title: 'Detail', items: [
    { key: 'detail', label: 'Sharpen', min: 0, max: 100 },
    { key: 'blur', label: 'Blur', min: 0, max: 100 }
  ] }
];

export function EditPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [p, setP] = useState<EditParams>({ ...DEFAULT_EDIT });
  const set = <K extends keyof EditParams>(key: K, value: EditParams[K]): void => setP((cur) => ({ ...cur, [key]: value }));
  const fmt = (key: Num) => (v: number): string => (key === 'exposure' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : `${v}`);
  return (
    <Panel title="Edit photo" onBack={onBack} onClose={onClose} applyLabel="Save" onReset={() => setP({ ...DEFAULT_EDIT })}
      onApply={() => onApply({ ...p })}>
      <div className="twocol">
        <ImagePreview compare maxHeight={460} request={{ op: 'edit', path: file.path, maxSide: 900, options: { ...p } }} />
        <div className="twocol__side">
          {GROUPS.map((g) => (
            <section key={g.title} className="panel__stack">
              <h3 className="group-title">{g.title}</h3>
              {g.items.map((it) => (
                <Slider key={it.key} label={it.label} value={p[it.key]} min={it.min} max={it.max} step={it.step}
                  onChange={(v) => set(it.key, v)} onReset={() => set(it.key, DEFAULT_EDIT[it.key])} format={fmt(it.key)} />
              ))}
            </section>
          ))}
          <section className="panel__stack">
            <h3 className="group-title">Effects</h3>
            <div className="fx-chips" role="radiogroup" aria-label="Effect">
              {EFFECTS.map((e) => (
                <button key={e.value} type="button" role="radio" aria-checked={p.effect === e.value}
                  className={`fx-chip${p.effect === e.value ? ' is-on' : ''}`} onClick={() => set('effect', e.value)}>{e.label}</button>
              ))}
            </div>
            <Slider label="Vignette" value={p.vignette} min={0} max={100} onChange={(v) => set('vignette', v)} onReset={() => set('vignette', 0)} />
          </section>
        </div>
      </div>
    </Panel>
  );
}
