import { useState } from 'react';
import { FORMATS } from '@shared/formats';
import { DEFAULT_CONVERT_OPTIONS, type ConvertOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import type { ConvertCardProps } from '..';

type Font = NonNullable<ConvertOptions['font']>;
type Size = NonNullable<ConvertOptions['textSize']>;
type Page = NonNullable<ConvertOptions['pageSize']>;

export function TextRenderCard({ target, onApply, onBack, onClose }: ConvertCardProps) {
  const [font, setFont] = useState<Font>('mono');
  const [size, setSize] = useState<Size>(DEFAULT_CONVERT_OPTIONS.textSize);
  const [page, setPage] = useState<Page>(DEFAULT_CONVERT_OPTIONS.pageSize);
  const [dpi, setDpi] = useState<number>(DEFAULT_CONVERT_OPTIONS.imageDpi);
  const isImage = target === 'jpg' || target === 'png';
  const reset = (): void => {
    setFont('mono'); setSize(DEFAULT_CONVERT_OPTIONS.textSize); setPage(DEFAULT_CONVERT_OPTIONS.pageSize); setDpi(DEFAULT_CONVERT_OPTIONS.imageDpi);
  };
  return (
    <Panel title={`Text to ${FORMATS[target].label}`} onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ font, textSize: size, pageSize: page, imageDpi: dpi })}>
      <Row label="Font">
        <Segmented<Font> label="Font" value={font} onChange={setFont}
          options={[{ value: 'mono', label: 'Mono' }, { value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }]} />
      </Row>
      <Row label="Size">
        <Segmented<Size> label="Size" value={size} onChange={setSize}
          options={[{ value: 'small', label: 'S' }, { value: 'medium', label: 'M' }, { value: 'large', label: 'L' }, { value: 'xlarge', label: 'XL' }]} />
      </Row>
      <Row label="Page">
        <Select<Page> label="Page" value={page} onChange={setPage}
          options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a5', label: 'A5' }]} />
      </Row>
      {isImage && (
        <Row label="Resolution">
          <Segmented label="Resolution" value={dpi} onChange={setDpi}
            options={[{ value: 96, label: '96 DPI' }, { value: 150, label: '150 DPI' }, { value: 300, label: '300 DPI' }]} />
        </Row>
      )}
    </Panel>
  );
}
