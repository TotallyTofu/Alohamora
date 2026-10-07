import { useState } from 'react';
import { api } from '../lib/api';
import { isOver, useNativeDrop } from '../lib/nativeDrop';
import { Button } from './Button';
import { Icon } from './Icon';

/** The big drop target on the Convert page. The drop itself is handled by HomeView (anywhere on the page). */
export function DropZone() {
  const [over, setOver] = useState(false);
  useNativeDrop((e) => setOver((e.phase === 'enter' || e.phase === 'over') && isOver(e.x, e.y, '.dropzone')));
  const open = (paths: string[]): void => { if (paths.length) void api.openOverlay(paths, 'convert'); };
  return (
    <div className={`dropzone${over ? ' is-over' : ''}`}>
      <Icon name="drop" size={30} />
      <p className="dropzone__title">Drop files here</p>
      <p className="dropzone__sub">
        or <Button variant="soft" onClick={() => void api.pickFiles().then(open)}>Browse files…</Button>
      </p>
    </div>
  );
}
