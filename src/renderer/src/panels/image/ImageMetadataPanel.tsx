import { useEffect, useState } from 'react';
import type { ImageMetadataOptions } from '@shared/toolOptions';
import type { MetadataInfo } from '@shared/types';
import { Panel, Row } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

type Action = ImageMetadataOptions['action'];
type FieldKey = 'artist' | 'copyright' | 'description' | 'dateTaken';

export function ImageMetadataPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [info, setInfo] = useState<MetadataInfo | null>(null);
  const [action, setAction] = useState<Action>('remove-all');
  const [edits, setEdits] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    let alive = true;
    void api.readMetadata(file.path).then((i) => { if (alive) setInfo(i); }).catch(() => { if (alive) setInfo({ kind: 'image', fields: [] }); });
    return () => { alive = false; };
  }, [file.path]);

  if (!info) return <Panel title="Photo metadata" onBack={onBack} onClose={onClose}><p className="card-note">Reading metadata…</p></Panel>;

  const value = (key: FieldKey): string => edits[key] ?? info.fields.find((f) => f.key === key)?.value ?? '';
  const readonly = info.fields.filter((f) => !f.editable && f.value);
  const many = files.length > 1;
  const label = action === 'edit' ? 'Save' : many ? `Clean ${files.length} images` : action === 'remove-gps' ? 'Remove location' : 'Remove metadata';
  return (
    <Panel title="Photo metadata" onBack={onBack} onClose={onClose} applyLabel={label} onReset={() => { setEdits({}); setAction('remove-all'); }}
      onApply={() => onApply({ action, fields: action === 'edit' ? { ...edits } : {} } satisfies ImageMetadataOptions)}>
      {info.hasGps && <span className="warn-chip">Contains location</span>}
      {readonly.length === 0 && <p className="card-note">No camera information found in this picture.</p>}
      {readonly.map((f) => <div key={f.key} className="ro-row"><span>{f.label}</span><span title={f.value}>{f.value}</span></div>)}
      <Row label="Action">
        <Segmented<Action> label="Action" value={action} onChange={setAction}
          options={[{ value: 'remove-all', label: 'Remove all' }, { value: 'remove-gps', label: 'Remove location' }, { value: 'edit', label: 'Edit' }]} />
      </Row>
      {action === 'edit' && (
        <>
          {(['artist', 'copyright', 'description'] as const).map((k) => (
            <Row key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <div className="meta-field"><TextField label={k} value={value(k)} onChange={(v) => setEdits((e) => ({ ...e, [k]: v }))} /></div>
            </Row>
          ))}
          <Row label="Date taken">
            <input className="textfield meta-field" type="datetime-local" aria-label="Date taken" value={value('dateTaken')}
              onChange={(e) => setEdits((cur) => ({ ...cur, dateTaken: e.target.value }))} />
          </Row>
        </>
      )}
      <p className="card-note">JPEG and PNG are cleaned without re-compressing.</p>
      {many && <p className="card-note">The table shows the first picture; the action applies to all {files.length}.</p>}
    </Panel>
  );
}
