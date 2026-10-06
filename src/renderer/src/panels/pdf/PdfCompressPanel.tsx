import { useState } from 'react';
import { formatBytes } from '@shared/time';
import { TOOL_DEFAULTS, type PdfCompressOptions } from '@shared/toolOptions';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['pdf.compress'];
type Level = PdfCompressOptions['level'];
const INFO: Record<Level, string> = {
  light: 'Re-saves the file and gently shrinks large photos. Text and layout stay untouched.',
  balanced: 'Shrinks embedded photos to about 2000 px at good quality. Best choice for most files.',
  strong: 'Shrinks photos to about 1400 px at lower quality. Noticeably smaller, still readable.',
  max: 'Turns every page into a picture. Smallest result, but text can no longer be selected or searched.'
};

export function PdfCompressPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [level, setLevel] = useState<Level>(D.level);
  return (
    <Panel title="Compress PDF" onBack={onBack} onClose={onClose}
      applyLabel={files.length > 1 ? `Compress ${files.length} PDFs` : 'Compress'} onReset={() => setLevel(D.level)}
      onApply={() => onApply({ level } satisfies PdfCompressOptions)}>
      <p className="panel__info">{formatBytes(file.size)}{file.pages ? ` · ${file.pages} pages` : ''}</p>
      <Segmented<Level> label="Compression level" value={level} onChange={setLevel}
        options={[{ value: 'light', label: 'Light' }, { value: 'balanced', label: 'Balanced' }, { value: 'strong', label: 'Strong' }, { value: 'max', label: 'Max' }]} />
      <p className="card-note">{INFO[level]}</p>
      {level === 'max' && <span className="warn-chip">Text will no longer be selectable.</span>}
    </Panel>
  );
}
