import type { ComponentType } from 'react';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt, ToolId } from '@shared/types';
import { CueTimingCard } from './convert/CueTimingCard';
import { DocModeCard } from './convert/DocModeCard';
import { EpubToPdfCard } from './convert/EpubToPdfCard';
import { CompressPanel } from './video/CompressPanel';
import { TrimPanel } from './video/TrimPanel';
import { SplitPanel } from './video/SplitPanel';
import { SpeedPanel } from './video/SpeedPanel';
import { SnapshotPanel } from './video/SnapshotPanel';
import { RedactPanel } from './video/RedactPanel';
import { JoinPanel } from './video/JoinPanel';
import { CropPanel } from './common/CropPanel';
import { MetadataPanel } from './common/MetadataPanel';
import { GenericCard } from './convert/GenericCard';
import { GifCard } from './convert/GifCard';
import { SvgCard } from './convert/SvgCard';
import { TextRenderCard } from './convert/TextRenderCard';

export interface ToolPanelProps {
  files: FileInfo[];
  onApply: (options: Record<string, unknown>) => void;
  onBack: () => void;
  onClose: () => void;
}
export interface ToolPanelDef { component: ComponentType<ToolPanelProps>; width: number; height: number }

/** Tool panels (Phases 7–10 add entries). */
export const PANELS: Partial<Record<ToolId, ToolPanelDef>> = {};

export interface ConvertCardProps {
  files: FileInfo[];
  target: Fmt;
  onApply: (o: ConvertOptions) => void;
  onBack: () => void;
  onClose: () => void;
}
export interface ConvertCardDef { component: ComponentType<ConvertCardProps>; width: number; height: number }

/** Keys: "<category>-><target>", "*-><target>", "<category>->*", "*->*" (most specific wins). */
export const CONVERT_CARDS: Record<string, ConvertCardDef> = {};

export function convertCardFor(category: Category | null, target: Fmt): ConvertCardDef | undefined {
  return CONVERT_CARDS[`${category}->${target}`] ?? CONVERT_CARDS[`*->${target}`] ?? CONVERT_CARDS[`${category}->*`] ?? CONVERT_CARDS['*->*'];
}

CONVERT_CARDS['video->gif'] = { component: GifCard, width: 420, height: 420 };
CONVERT_CARDS['*->*'] = { component: GenericCard, width: 420, height: 360 };
CONVERT_CARDS['image->svg'] = { component: SvgCard, width: 420, height: 440 };
CONVERT_CARDS['text->srt'] = { component: CueTimingCard, width: 420, height: 420 };
CONVERT_CARDS['text->vtt'] = { component: CueTimingCard, width: 420, height: 420 };
CONVERT_CARDS['text->pdf'] = { component: TextRenderCard, width: 420, height: 500 };
CONVERT_CARDS['text->jpg'] = { component: TextRenderCard, width: 420, height: 500 };
CONVERT_CARDS['text->png'] = { component: TextRenderCard, width: 420, height: 500 };
CONVERT_CARDS['pdf->docx'] = { component: DocModeCard, width: 440, height: 460 };
CONVERT_CARDS['pdf->epub'] = { component: DocModeCard, width: 440, height: 460 };
CONVERT_CARDS['epub->pdf'] = { component: EpubToPdfCard, width: 440, height: 520 };

PANELS['video.compress'] = { component: CompressPanel, width: 420, height: 540 };
PANELS['video.trim'] = { component: TrimPanel, width: 460, height: 600 };
PANELS['video.split'] = { component: SplitPanel, width: 460, height: 640 };
PANELS['video.speed'] = { component: SpeedPanel, width: 420, height: 460 };
PANELS['video.snapshot'] = { component: SnapshotPanel, width: 440, height: 620 };
PANELS['video.redact'] = { component: RedactPanel, width: 540, height: 720 };
PANELS['video.join'] = { component: JoinPanel, width: 460, height: 620 };
PANELS['video.crop'] = { component: CropPanel, width: 440, height: 660 };
PANELS['video.metadata'] = { component: MetadataPanel, width: 440, height: 640 };
