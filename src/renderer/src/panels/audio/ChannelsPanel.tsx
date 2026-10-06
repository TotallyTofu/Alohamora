import { useState } from 'react';
import type { AudioChannelsOptions } from '@shared/toolOptions';
import { Panel } from '../../components/Panel';
import type { ToolPanelProps } from '..';

type Mode = AudioChannelsOptions['mode'];
const CHOICES: Array<{ mode: Mode; label: string; needsStereo: boolean }> = [
  { mode: 'mono', label: 'Stereo → Mono', needsStereo: false },
  { mode: 'stereo', label: 'Mono → Stereo', needsStereo: false },
  { mode: 'left', label: 'Left channel only', needsStereo: true },
  { mode: 'right', label: 'Right channel only', needsStereo: true },
  { mode: 'swap', label: 'Swap left / right', needsStereo: true }
];

export function ChannelsPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const stereo = (file.channels ?? 2) >= 2;
  const [mode, setMode] = useState<Mode>(stereo ? 'mono' : 'stereo');
  return (
    <Panel title="Audio channels" onBack={onBack} onClose={onClose} applyLabel="Apply"
      onApply={() => onApply({ mode } satisfies AudioChannelsOptions)}>
      {!stereo && <p className="card-note">This file is mono, so only the first two options apply.</p>}
      <div className="radiolist" role="radiogroup" aria-label="Channel layout">
        {CHOICES.map((c) => (
          <button key={c.mode} type="button" role="radio" aria-checked={mode === c.mode} disabled={c.needsStereo && !stereo}
            className={`radio${mode === c.mode ? ' is-on' : ''}`} onClick={() => setMode(c.mode)}>{c.label}</button>
        ))}
      </div>
    </Panel>
  );
}
