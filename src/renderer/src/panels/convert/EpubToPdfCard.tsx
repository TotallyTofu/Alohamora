import { useState } from 'react';
import { DEFAULT_CONVERT_OPTIONS, type ConvertOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import type { ConvertCardProps } from '..';

type Mode = 'reflow' | 'pages';
type Size = NonNullable<ConvertOptions['textSize']>;
type Font = NonNullable<ConvertOptions['font']>;
type Page = NonNullable<ConvertOptions['pageSize']>;

export function EpubToPdfCard({ onApply, onBack, onClose }: ConvertCardProps) {
  const [mode, setMode] = useState<Mode>('reflow');
  const [size, setSize] = useState<Size>(DEFAULT_CONVERT_OPTIONS.textSize);
  const [font, setFont] = useState<Font>('original');
  const [page, setPage] = useState<Page>(DEFAULT_CONVERT_OPTIONS.pageSize);
  const reset = (): void => {
    setMode('reflow'); setSize(DEFAULT_CONVERT_OPTIONS.textSize); setFont('original'); setPage(DEFAULT_CONVERT_OPTIONS.pageSize);
  };
  return (
    <Panel title="EPUB to PDF" onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ docMode: mode, textSize: size, font, pageSize: page })}>
      <Row label="Layout">
        <Segmented<Mode> label="Layout" value={mode} onChange={setMode}
          options={[{ value: 'reflow', label: 'Adjustable text' }, { value: 'pages', label: 'Preserved pages' }]} />
      </Row>
      {mode === 'reflow' && (
        <>
          <Row label="Text size">
            <Segmented<Size> label="Text size" value={size} onChange={setSize}
              options={[{ value: 'small', label: 'S' }, { value: 'medium', label: 'M' }, { value: 'large', label: 'L' }, { value: 'xlarge', label: 'XL' }]} />
          </Row>
          <Row label="Font">
            <Select<Font> label="Font" value={font} onChange={setFont}
              options={[{ value: 'original', label: 'Original' }, { value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} />
          </Row>
        </>
      )}
      <Row label="Page">
        <Select<Page> label="Page" value={page} onChange={setPage}
          options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a5', label: 'A5' }]} />
      </Row>
      {mode === 'pages' && <p className="card-note">Keeps the publisher's styling.</p>}
      <p className="card-note">Fixed-layout ebooks (comics, picture books) always keep their exact pages.</p>
    </Panel>
  );
}
