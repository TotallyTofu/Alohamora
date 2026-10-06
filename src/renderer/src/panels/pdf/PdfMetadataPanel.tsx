import { useEffect, useState } from 'react';
import type { PdfMetadataOptions } from '@shared/toolOptions';
import type { MetadataInfo } from '@shared/types';
import { Panel, Row } from '../../components/Panel';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

type Key = 'title' | 'author' | 'subject' | 'keywords';
const KEYS: Key[] = ['title', 'author', 'subject', 'keywords'];

export function PdfMetadataPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [info, setInfo] = useState<MetadataInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<Key, string>>({ title: '', author: '', subject: '', keywords: '' });
  const [removeAll, setRemoveAll] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.readMetadata(file.path).then((i) => {
      if (!alive) return;
      setInfo(i);
      setValues(Object.fromEntries(KEYS.map((k) => [k, i.fields.find((f) => f.key === k)?.value ?? ''])) as Record<Key, string>);
    }).catch((e: unknown) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [file.path]);

  if (error) return <Panel title="PDF metadata" onBack={onBack} onClose={onClose}><p className="card-note">Could not read this PDF: {error}</p></Panel>;
  if (!info) return <Panel title="PDF metadata" onBack={onBack} onClose={onClose}><p className="card-note">Reading…</p></Panel>;
  const readonly = info.fields.filter((f) => !f.editable);
  return (
    <Panel title="PDF metadata" onBack={onBack} onClose={onClose} applyLabel={removeAll ? 'Remove metadata' : 'Save'}
      onApply={() => onApply({ removeAll, ...values } satisfies PdfMetadataOptions)}>
      {KEYS.map((k) => (
        <Row key={k} label={k[0].toUpperCase() + k.slice(1)} hint={k === 'keywords' ? 'Separate with commas' : undefined}>
          <div className="meta-field"><TextField label={k} value={removeAll ? '' : values[k]} onChange={(v) => setValues((cur) => ({ ...cur, [k]: v }))} /></div>
        </Row>
      ))}
      {readonly.map((f) => <div key={f.key} className="ro-row"><span>{f.label}</span><span title={f.value}>{f.value}</span></div>)}
      <Row label="Remove all metadata" hint="Bookmarks and form fields are not kept">
        <Toggle label="Remove all metadata" checked={removeAll} onChange={setRemoveAll} />
      </Row>
    </Panel>
  );
}
