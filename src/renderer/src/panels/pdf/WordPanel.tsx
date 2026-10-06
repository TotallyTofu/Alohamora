import { DocModeCard } from '../convert/DocModeCard';
import type { ToolPanelProps } from '..';

/** The tool version of "PDF → Word": same options as the conversion card, different payload. */
export function WordPanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  return (
    <DocModeCard files={files} target="docx" onBack={onBack} onClose={onClose}
      onApply={(o) => onApply({ mode: o.docMode ?? 'reflow', ocr: o.ocr ?? 'auto' })} />
  );
}
