import { useEffect, useState } from 'react';
import { FORMATS } from '@shared/formats';
import { DEFAULT_CONVERT_OPTIONS } from '@shared/toolOptions';
import { Panel, Row } from '../../components/Panel';
import { Slider } from '../../components/Slider';
import { api } from '../../lib/api';
import type { ConvertCardProps } from '..';

const LOSSY_IMAGE_TARGETS = ['jpg', 'webp', 'avif', 'heic'];

/** Fallback card for Shift+Enter / right-click on an "instant" conversion. */
export function GenericCard({ files, target, onApply, onBack, onClose }: ConvertCardProps) {
  const [quality, setQuality] = useState<number>(DEFAULT_CONVERT_OPTIONS.quality);
  useEffect(() => { void api.getSettings().then((s) => setQuality(s.imageQuality)); }, []);
  const hasQuality = files.every((f) => f.category === 'image') && LOSSY_IMAGE_TARGETS.includes(target);
  return (
    <Panel title={`Convert to ${FORMATS[target].label}`} onBack={onBack} onClose={onClose} applyLabel="Convert"
      onReset={hasQuality ? () => setQuality(DEFAULT_CONVERT_OPTIONS.quality) : undefined}
      onApply={() => onApply(hasQuality ? { quality } : {})}>
      {hasQuality
        ? <Slider label="Quality" value={quality} min={40} max={100} onChange={setQuality} format={(v) => `${v}`} />
        : <p className="card-note">No options for this format — default high quality is used.</p>}
    </Panel>
  );
}
