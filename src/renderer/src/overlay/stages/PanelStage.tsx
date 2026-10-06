import { useEffect } from 'react';
import { toolMeta } from '@shared/tools';
import type { ToolId } from '@shared/types';
import { Panel } from '../../components/Panel';
import { api } from '../../lib/api';
import { PANELS } from '../../panels';
import { useDeepFiles } from '../../panels/useDeepFiles';
import { useOverlay } from '../store';

export function PanelStage({ toolId }: { toolId: ToolId }) {
  const go = useOverlay((s) => s.go);
  const files = useDeepFiles();
  const meta = toolMeta(toolId);
  const def = PANELS[toolId];
  const back = (): void => go({ name: 'wheel' });
  const close = (): void => { void api.closeOverlay(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !typing) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!files) return <Panel title={meta.label} onBack={back} onClose={close}><p>Reading file…</p></Panel>;
  if (!def) return <Panel title={meta.label} onBack={back} onClose={close}><p>This tool is coming soon.</p></Panel>;
  const C = def.component;
  const apply = async (options: Record<string, unknown>): Promise<void> => {
    const jobId = await api.startJob({ kind: 'tool', inputs: files.map((f) => f.path), toolId, options });
    go({ name: 'running', jobId });
  };
  return <C files={files} onApply={(o) => void apply(o)} onBack={back} onClose={close} />;
}
