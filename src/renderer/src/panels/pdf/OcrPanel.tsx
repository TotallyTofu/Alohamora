import { useState } from 'react';
import { parsePageRanges } from '@shared/pageRanges';
import { TOOL_DEFAULTS, type PdfOcrOptions } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { useOverlay } from '../../overlay/store';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['pdf.ocr'];
const LANG_LABEL: Record<string, string> = { eng: 'English', vie: 'Tiếng Việt' };
type Output = PdfOcrOptions['output'];

export function OcrPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const available = useOverlay((s) => s.caps?.ocrLanguages) ?? ['eng'];
  const [languages, setLanguages] = useState<string[]>(D.languages.filter((l) => available.includes(l)).length ? [...D.languages] : [available[0] ?? 'eng']);
  const [output, setOutput] = useState<Output>(D.output);
  const [ranges, setRanges] = useState('');

  let error: string | null = null;
  try { parsePageRanges(ranges, file.pages ?? 0); } catch (e) { error = e instanceof RangeError ? e.message : String(e); }
  const toggle = (l: string): void => setLanguages((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));
  return (
    <Panel title="Read text (OCR)" onBack={onBack} onClose={onClose} applyLabel="Start reading" applyDisabled={error !== null || languages.length === 0}
      onReset={() => { setLanguages([...D.languages]); setOutput(D.output); setRanges(''); }}
      onApply={() => onApply({ languages, output, ranges } satisfies PdfOcrOptions)}>
      <Row label="Languages">
        <div className="checks">
          {available.map((l) => (
            <label key={l} className="check"><input type="checkbox" checked={languages.includes(l)} onChange={() => toggle(l)} />{LANG_LABEL[l] ?? l}</label>
          ))}
        </div>
      </Row>
      <Row label="Output">
        <Segmented<Output> label="Output" value={output} onChange={setOutput} options={[{ value: 'txt', label: 'Text file (.txt)' }, { value: 'pdf', label: 'Searchable PDF' }]} />
      </Row>
      <div className="panel__stack">
        <TextField label="Pages" placeholder="All pages — or e.g. 1-3, 5" value={ranges} onChange={setRanges} />
        {error && ranges.trim() !== '' && <p className="field-error" role="alert">{error}</p>}
      </div>
      <p className="card-note">Reading takes about 2–5 s per page.</p>
    </Panel>
  );
}
