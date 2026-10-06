import { useMemo, useState } from 'react';
import { splitGroups } from '@shared/pdfSplit';
import { TOOL_DEFAULTS, type PdfSplitOptions } from '@shared/toolOptions';
import { Button } from '../../components/Button';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['pdf.split'];
type Mode = PdfSplitOptions['mode'];

export function PdfSplitPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const total = file.pages ?? 0;
  const [mode, setMode] = useState<Mode>(D.mode);
  const [every, setEvery] = useState(2);
  const [ranges, setRanges] = useState('');

  const options: PdfSplitOptions = { mode, every, ranges };
  const plan = useMemo(() => {
    try { return { groups: splitGroups(options, total), error: null as string | null }; }
    catch (e) { return { groups: [] as number[][], error: e instanceof RangeError ? e.message : String(e) }; }
  }, [mode, every, ranges, total]);
  // An empty range box is only an error once the user has chosen a range mode; show the hint softly until then.
  const showError = plan.error !== null && ranges.trim() !== '';
  return (
    <Panel title="Split PDF" onBack={onBack} onClose={onClose} applyLabel="Split" applyDisabled={plan.error !== null || plan.groups.length === 0}
      onReset={() => { setMode(D.mode); setEvery(2); setRanges(''); }} onApply={() => onApply({ ...options })}>
      <p className="panel__info">{file.name} · {total} page{total === 1 ? '' : 's'}</p>
      <Segmented<Mode> label="Split mode" value={mode} onChange={setMode}
        options={[{ value: 'each', label: 'Every page' }, { value: 'every', label: 'Every N pages' }, { value: 'ranges', label: 'Custom ranges' }, { value: 'extract', label: 'Extract pages' }]} />
      {mode === 'every' && (
        <Row label="Pages per file">
          <div className="stepper">
            <Button variant="soft" onClick={() => setEvery((n) => Math.max(1, n - 1))} aria-label="Fewer pages">−</Button>
            <span className="stepper__value">{every}</span>
            <Button variant="soft" onClick={() => setEvery((n) => Math.min(Math.max(1, total), n + 1))} aria-label="More pages">+</Button>
          </div>
        </Row>
      )}
      {(mode === 'ranges' || mode === 'extract') && (
        <div className="panel__stack">
          <TextField label="Pages" placeholder="e.g. 1-3, 5, 8-" value={ranges} onChange={setRanges} />
          {showError && <p className="field-error" role="alert">{plan.error}</p>}
          <p className="card-note">{mode === 'ranges' ? 'Each range becomes its own file.' : 'All listed pages go into one new file.'}</p>
        </div>
      )}
      <p className="panel__readout" style={{ marginLeft: 0 }}>{plan.error ? '—' : `Creates ${plan.groups.length} file${plan.groups.length === 1 ? '' : 's'}`}</p>
    </Panel>
  );
}
