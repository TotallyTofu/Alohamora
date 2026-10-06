import { useState } from 'react';
import { formatBytes } from '@shared/time';
import { TOOL_DEFAULTS, type ImageCompressOptions } from '@shared/toolOptions';
import type { ImagePreviewResult } from '@shared/types';
import { ImagePreview } from '../../components/ImagePreview';
import { Panel, Row } from '../../components/Panel';
import { Select } from '../../components/Select';
import { Slider } from '../../components/Slider';
import { Toggle } from '../../components/Toggle';
import type { ToolPanelProps } from '..';

const D = TOOL_DEFAULTS['image.compress'];
type Format = ImageCompressOptions['format'];

export function ImageCompressPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const [quality, setQuality] = useState(D.quality);
  const [maxSide, setMaxSide] = useState('0');
  const [format, setFormat] = useState<Format>(D.format);
  const [strip, setStrip] = useState(D.stripMetadata);
  const [result, setResult] = useState<ImagePreviewResult | null>(null);

  const options: ImageCompressOptions = { quality, maxSide: Number(maxSide), format, stripMetadata: strip };
  const readout = result?.bytes !== undefined && result.originalBytes
    ? `${formatBytes(result.originalBytes)} → ${formatBytes(result.bytes)} (−${Math.max(0, Math.round((1 - result.bytes / result.originalBytes) * 100))}%)`
    : 'Estimating…';
  return (
    <Panel title="Compress image" onBack={onBack} onClose={onClose}
      applyLabel={files.length > 1 ? `Compress ${files.length} images` : 'Compress'}
      onReset={() => { setQuality(D.quality); setMaxSide('0'); setFormat(D.format); setStrip(D.stripMetadata); }}
      onApply={() => onApply({ ...options })}>
      <ImagePreview compare maxHeight={240} onLoaded={setResult} request={{ op: 'compress', path: file.path, maxSide: 900, options: { ...options } }} />
      <p className="size-readout">{readout}</p>
      <Slider label="Quality" value={quality} min={10} max={100} onChange={setQuality} />
      <Row label="Max size">
        <Select<string> label="Max size" value={maxSide} onChange={setMaxSide}
          options={[{ value: '0', label: 'Original' }, ...[4096, 2560, 1920, 1280].map((v) => ({ value: String(v), label: `${v} px` }))]} />
      </Row>
      <Row label="Format">
        <Select<Format> label="Format" value={format} onChange={setFormat}
          options={[{ value: 'keep', label: 'Keep' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WebP' }, { value: 'avif', label: 'AVIF' }]} />
      </Row>
      <Row label="Remove metadata" hint="EXIF, GPS">
        <Toggle label="Remove metadata (EXIF, GPS)" checked={strip} onChange={setStrip} />
      </Row>
    </Panel>
  );
}
