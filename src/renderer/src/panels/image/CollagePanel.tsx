import { useMemo, useState } from 'react';
import { TOOL_DEFAULTS, type CollageOptions } from '@shared/toolOptions';
import { ColorSwatches } from '../../components/ColorSwatches';
import { ImagePreview } from '../../components/ImagePreview';
import { Panel, Row } from '../../components/Panel';
import { ReorderList } from '../../components/ReorderList';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import { Slider } from '../../components/Slider';
import { baseName } from '../../lib/format';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['image.collage'];
type Layout = CollageOptions['layout'];
type Fit = CollageOptions['fit'];

export function CollagePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const [order, setOrder] = useState(files.map((f) => f.path));
  const [layout, setLayout] = useState<Layout>(D.layout);
  const [gap, setGap] = useState(D.gap);
  const [radius, setRadius] = useState(D.radius);
  const [background, setBackground] = useState(D.background);
  const [width, setWidth] = useState(String(D.width));
  const [fit, setFit] = useState<Fit>(D.fit);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  const options: CollageOptions = { layout, order, gap, background, radius, width: Number(width), fit };
  return (
    <Panel title="Make a collage" onBack={onBack} onClose={onClose} applyLabel="Create collage"
      onReset={() => { setOrder(files.map((f) => f.path)); setLayout(D.layout); setGap(D.gap); setRadius(D.radius); setBackground(D.background); setWidth(String(D.width)); setFit(D.fit); }}
      onApply={() => onApply({ ...options })}>
      <div className="twocol">
        <ImagePreview maxHeight={420} request={{ op: 'collage', path: files[0].path, paths: files.map((f) => f.path), maxSide: 800, options: { ...options } }} />
        <div className="twocol__side">
          <Segmented<Layout> label="Layout" value={layout} onChange={setLayout}
            options={[{ value: 'grid', label: 'Grid' }, { value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }, { value: 'featured', label: 'Featured' }]} />
          <ReorderList icon="image" onChange={setOrder}
            items={order.map((p) => byPath.get(p)).filter((f) => !!f).map((f) => ({ id: f.path, title: baseName(f.path), thumbnail: f.thumbnail }))} />
          <Slider label="Gap" value={gap} min={0} max={40} onChange={setGap} />
          <Slider label="Corners" value={radius} min={0} max={40} onChange={setRadius} />
          <Row label="Background"><ColorSwatches label="Background" value={background} onChange={setBackground} options={['#FFFFFF', '#F3F3F2', '#1F1F1F', '#FF5A1F']} /></Row>
          <Row label="Width">
            <Select<string> label="Width" value={width} onChange={setWidth} options={['1080', '2048', '4096'].map((v) => ({ value: v, label: `${v} px` }))} />
          </Row>
          <Row label="Fit">
            <Segmented<Fit> label="Fit" value={fit} onChange={setFit} options={[{ value: 'cover', label: 'Fill (crop)' }, { value: 'contain', label: 'Fit (whole image)' }]} />
          </Row>
        </div>
      </div>
    </Panel>
  );
}
