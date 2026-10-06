import { useState } from 'react';
import { parsePageRanges } from '@shared/pageRanges';
import { TOOL_DEFAULTS, type PdfImagesOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Slider } from '../../components/Slider';
import { TextField } from '../../components/TextField';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['pdf.images'];
type Format = PdfImagesOptions['format'];

export function PdfImagesPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [format, setFormat] = useState<Format>(D.format);
  const [dpi, setDpi] = useState(D.dpi);
  const [ranges, setRanges] = useState('');
  const [quality, setQuality] = useState(D.quality);

  let error: string | null = null;
  try { parsePageRanges(ranges, file.pages ?? 0); } catch (e) { error = e instanceof RangeError ? e.message : String(e); }
  return (
    <Panel title="Pages as images" onBack={onBack} onClose={onClose} applyLabel="Save images" applyDisabled={error !== null}
      onReset={() => { setFormat(D.format); setDpi(D.dpi); setRanges(''); setQuality(D.quality); }}
      onApply={() => onApply({ format, dpi, ranges, quality } satisfies PdfImagesOptions)}>
      <Row label="Format">
        <Segmented<Format> label="Format" value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]} />
      </Row>
      <Row label="Resolution" hint="300 DPI ≈ print quality">
        <Segmented<number> label="Resolution (DPI)" value={dpi} onChange={setDpi} options={[72, 150, 300, 600].map((v) => ({ value: v, label: String(v) }))} />
      </Row>
      <div className="panel__stack">
        <TextField label="Pages" placeholder="All pages — or e.g. 1-3, 5" value={ranges} onChange={setRanges} />
        {error && ranges.trim() !== '' && <p className="field-error" role="alert">{error}</p>}
      </div>
      {format === 'jpg' && <Slider label="Quality" value={quality} min={40} max={100} onChange={setQuality} />}
    </Panel>
  );
}
