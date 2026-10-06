import { useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useOverlay } from '../store';

export function ErrorStage({ message, details }: { message: string; details?: string }) {
  const [open, setOpen] = useState(false);
  const go = useOverlay((s) => s.go);
  return (
    <div className="card">
      <div className="status__icon status__icon--err"><Icon name="alert" size={32} /></div>
      <h2 className="status__title" style={{ whiteSpace: 'normal' }}>{message}</h2>
      {details && <Button variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details'}</Button>}
      {open && details && <pre className="status__details">{details}</pre>}
      <div className="status__actions">
        {details && <Button variant="soft" onClick={() => void navigator.clipboard.writeText(`${message}\n\n${details}`)}>Copy details</Button>}
        <Button variant="soft" onClick={() => go({ name: 'wheel' })}>Back</Button>
        <Button variant="primary" onClick={() => void api.closeOverlay()}>Close</Button>
      </div>
    </div>
  );
}
