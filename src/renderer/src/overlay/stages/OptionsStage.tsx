import type { ConvertOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { api } from '../../lib/api';
import { convertCardFor } from '../../panels';
import { useOverlay } from '../store';

export function OptionsStage({ target }: { target: Fmt }) {
  const { files, go } = useOverlay();
  const cats = new Set(files.map((f) => f.category));
  const category = cats.size === 1 ? [...cats][0] : null;
  const def = convertCardFor(category, target);
  const start = async (options: ConvertOptions): Promise<void> => {
    const jobId = await api.startJob({ kind: 'convert', inputs: files.map((f) => f.path), target, options });
    go({ name: 'running', jobId });
  };
  if (!def) return null;
  const Card = def.component;
  return <Card files={files} target={target} onApply={(o) => void start(o)} onBack={() => go({ name: 'wheel' })} onClose={() => void api.closeOverlay()} />;
}
