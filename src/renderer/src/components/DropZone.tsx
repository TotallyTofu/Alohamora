import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { pathsFromDataTransfer } from '../lib/dnd';
import { Button } from './Button';
import { Icon } from './Icon';

export function DropZone() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const open = (paths: string[], tools: boolean): void => { if (paths.length) void api.openOverlay(paths, tools ? 'tools' : 'convert'); };
  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); depth.current = 0; setOver(false); open(pathsFromDataTransfer(e.dataTransfer), e.altKey); }}
    >
      <Icon name="drop" size={30} />
      <p className="dropzone__title">Drop files here</p>
      <p className="dropzone__sub">
        or <Button variant="soft" onClick={() => void api.pickFiles().then((p) => open(p, false))}>Browse files…</Button>
      </p>
    </div>
  );
}
