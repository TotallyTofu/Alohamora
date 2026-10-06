import { useState } from 'react';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { Toggle } from '../../components/Toggle';
import type { ConvertCardProps } from '..';

type Mode = 'reflow' | 'pages';

/** PDF → DOCX ("Editable text" / "Exact look") and PDF → EPUB ("Adjustable text" / "Preserved pages"). */
export function DocModeCard({ target, onApply, onBack, onClose }: ConvertCardProps) {
  const isDocx = target === 'docx';
  const [mode, setMode] = useState<Mode>('reflow');
  const [ocr, setOcr] = useState(true);
  const labels = isDocx
    ? { reflow: 'Editable text', pages: 'Exact look' }
    : { reflow: 'Adjustable text', pages: 'Preserved pages' };
  const reset = (): void => { setMode('reflow'); setOcr(true); };
  return (
    <Panel title={isDocx ? 'Export to Word' : 'Make an EPUB'} onBack={onBack} onClose={onClose} onReset={reset} applyLabel="Convert"
      onApply={() => onApply({ docMode: mode, ocr: ocr ? 'auto' : 'off' })}>
      <Row label="Layout">
        <Segmented<Mode> label="Layout" value={mode} onChange={setMode}
          options={[{ value: 'reflow', label: labels.reflow }, { value: 'pages', label: labels.pages }]} />
      </Row>
      <p className="card-note">
        {mode === 'reflow'
          ? 'Text flows like a normal document. Headings, bold, italics and lists are kept; complex layouts may shift.'
          : "Each page becomes a picture — looks identical, but the text can't be edited."}
      </p>
      {mode === 'reflow' && (
        <Row label="Read scanned pages" hint="OCR runs only when the PDF has no text">
          <Toggle label="Read scanned pages (OCR)" checked={ocr} onChange={setOcr} />
        </Row>
      )}
    </Panel>
  );
}
