import { useEffect, useState } from 'react';
import type { MetadataInfo } from '@shared/types';
import type { MediaMetadataOptions } from '@shared/toolOptions';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Panel, Row } from '../../components/Panel';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import { api } from '../../lib/api';
import type { ToolPanelProps } from '..';

/** View / edit / remove tags. Shared by video and audio (audio also edits the cover picture). */
export function MetadataPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const isAudio = file.category === 'audio';
  const [info, setInfo] = useState<MetadataInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [removeAll, setRemoveAll] = useState(false);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.readMetadata(file.path).then((i) => { if (alive) setInfo(i); }).catch((e: unknown) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [file.path]);

  if (error) return <Panel title="Metadata" onBack={onBack} onClose={onClose}><p className="card-note">Could not read the tags: {error}</p></Panel>;
  if (!info) return <Panel title="Metadata" onBack={onBack} onClose={onClose}><p className="card-note">Reading tags…</p></Panel>;

  const editable = info.fields.filter((f) => f.editable);
  const readonly = info.fields.filter((f) => !f.editable);
  const valueOf = (key: string, original: string): string => (key in edits ? edits[key] : original);
  const changed = Object.fromEntries(editable.filter((f) => f.key in edits && edits[f.key] !== f.value).map((f) => [f.key, edits[f.key]]));
  const dirty = removeAll || Object.keys(changed).length > 0 || coverPath !== null || removeCover;

  const pickCover = async (): Promise<void> => {
    const picked = await api.pickFiles();
    if (picked[0]) { setCoverPath(picked[0]); setRemoveCover(false); }
  };

  return (
    <Panel title="Metadata" onBack={onBack} onClose={onClose} applyLabel={removeAll ? 'Remove metadata' : 'Save'} applyDisabled={!dirty}
      onReset={() => { setEdits({}); setRemoveAll(false); setCoverPath(null); setRemoveCover(false); }}
      onApply={() => onApply({ removeAll, tags: changed, coverPath, removeCover } satisfies MediaMetadataOptions)}>
      {info.hasGps && <span className="warn-chip">Contains location</span>}
      {isAudio && (
        <div className="cover-box">
          {!coverPath && !removeCover && info.coverDataUrl
            ? <img className="cover-box__img" alt="Cover art" src={info.coverDataUrl} />
            : <span className="cover-box__img"><Icon name="image" size={24} /></span>}
          <div className="panel__line">
            <Button variant="soft" onClick={() => void pickCover()} disabled={removeAll}>Change…</Button>
            <Button variant="ghost" onClick={() => { setCoverPath(null); setRemoveCover(true); }} disabled={removeAll || (!info.hasCover && !coverPath)}>Remove</Button>
          </div>
        </div>
      )}
      {coverPath && <p className="card-note">New cover: {coverPath.split(/[\\/]/).pop()}</p>}
      {editable.map((f) => (
        <Row key={f.key} label={f.label}>
          <div className="meta-field">
            <TextField label={f.label} value={removeAll ? '' : valueOf(f.key, f.value)} onChange={(v) => setEdits((e) => ({ ...e, [f.key]: v }))} />
          </div>
        </Row>
      ))}
      {readonly.map((f) => <div key={f.key} className="ro-row"><span>{f.label}</span><span title={f.value}>{f.value}</span></div>)}
      <Row label="Remove all metadata" hint="Titles, dates, camera and location">
        <Toggle label="Remove all metadata" checked={removeAll} onChange={setRemoveAll} />
      </Row>
    </Panel>
  );
}
