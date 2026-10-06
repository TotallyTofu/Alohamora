import { useEffect, useState } from 'react';
import type { JobUpdate } from '@shared/types';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { baseName } from '../../lib/format';
import { revealLabel } from '../../lib/platform';

export function DoneStage({ job }: { job: JobUpdate }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(() => void api.closeOverlay(), 6000);
    return () => clearTimeout(t);
  }, [hover]);
  const first = job.outputs[0];
  const title = !first ? 'Nothing new to save' : job.outputs.length === 1 ? `Saved ${baseName(first)}` : `Saved ${job.outputs.length} files`;
  return (
    <div className="card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="status__icon status__icon--ok"><Icon name="check" size={36} /></div>
      <h2 className="status__title" title={first}>{title}</h2>
      {job.note && <p className="status__sub">{job.note}</p>}
      <div className="status__actions">
        {first && <Button variant="primary" onClick={() => { void api.reveal(first); void api.closeOverlay(); }}>{revealLabel()}</Button>}
        {first && job.outputs.length === 1 && <Button variant="soft" onClick={() => { void api.openPath(first); void api.closeOverlay(); }}>Open</Button>}
        {!first && <Button variant="soft" onClick={() => void api.closeOverlay()}>Close</Button>}
      </div>
    </div>
  );
}
