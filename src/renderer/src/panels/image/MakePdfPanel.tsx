import { useMemo, useState } from 'react';
import { TOOL_DEFAULTS, type CreatePdfOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { ReorderList } from '../../components/ReorderList';
import { Segmented } from '../../components/Segmented';
import { Toggle } from '../../components/Toggle';
import { baseName } from '../../lib/format';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['image.pdf'];
type PageSize = CreatePdfOptions['pageSize'];
type Margin = CreatePdfOptions['margin'];

export function MakePdfPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const [order, setOrder] = useState(files.map((f) => f.path));
  const [pageSize, setPageSize] = useState<PageSize>(D.pageSize);
  const [margin, setMargin] = useState<Margin>(D.margin);
  const [combine, setCombine] = useState(D.combine);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  return (
    <Panel title="Make a PDF" onBack={onBack} onClose={onClose} applyLabel={combine ? 'Create PDF' : 'Create PDFs'}
      onReset={() => { setOrder(files.map((f) => f.path)); setPageSize(D.pageSize); setMargin(D.margin); setCombine(D.combine); }}
      onApply={() => onApply({ order, pageSize, margin, combine } satisfies CreatePdfOptions)}>
      <ReorderList icon="image" onChange={setOrder}
        items={order.map((p) => byPath.get(p)).filter((f) => !!f).map((f) => ({
          id: f.path, title: baseName(f.path), thumbnail: f.thumbnail, subtitle: f.width ? `${f.width}×${f.height}` : undefined
        }))} />
      <Row label="Page size">
        <Segmented<PageSize> label="Page size" value={pageSize} onChange={setPageSize}
          options={[{ value: 'fit', label: 'Fit image' }, { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} />
      </Row>
      <Row label="Margins">
        <Segmented<Margin> label="Margins" value={margin} onChange={setMargin}
          options={[{ value: 'none', label: 'None' }, { value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }]} />
      </Row>
      <Row label="One PDF for all images"><Toggle label="One PDF for all images" checked={combine} onChange={setCombine} /></Row>
    </Panel>
  );
}
