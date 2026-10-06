import type { ComponentType } from 'react';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt, ToolId } from '@shared/types';
import { CueTimingCard } from './convert/CueTimingCard';
import { DocModeCard } from './convert/DocModeCard';
import { EpubToPdfCard } from './convert/EpubToPdfCard';
import { PdfCompressPanel } from './pdf/PdfCompressPanel';
import { MergePanel } from './pdf/MergePanel';
import { PdfSplitPanel } from './pdf/PdfSplitPanel';
import { OrganizePanel } from './pdf/OrganizePanel';
import { PdfImagesPanel } from './pdf/PdfImagesPanel';
import { OcrPanel } from './pdf/OcrPanel';
import { WordPanel } from './pdf/WordPanel';
import { PdfMetadataPanel } from './pdf/PdfMetadataPanel';
import { ShiftPanel } from './subtitle/ShiftPanel';
import { ImageCompressPanel } from './image/ImageCompressPanel';
import { ResizePanel } from './image/ResizePanel';
import { ImageCropPanel } from './image/ImageCropPanel';
import { EditPanel } from './image/EditPanel';
import { BackgroundPanel } from './image/BackgroundPanel';
import { ImageRedactPanel } from './image/ImageRedactPanel';
import { ImageMetadataPanel } from './image/ImageMetadataPanel';
import { CollagePanel } from './image/CollagePanel';
import { MakePdfPanel } from './image/MakePdfPanel';
import { AudioCompressPanel } from './audio/AudioCompressPanel';
import { ChannelsPanel } from './audio/ChannelsPanel';
import { NormalizePanel } from './audio/NormalizePanel';
import { AudioTrimPanel } from './audio/AudioTrimPanel';
import { VisualizePanel } from './audio/VisualizePanel';
import { BleepPanel } from './audio/BleepPanel';
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
PANELS['audio.compress'] = { component: AudioCompressPanel, width: 420, height: 460 };
PANELS['audio.channels'] = { component: ChannelsPanel, width: 420, height: 420 };
PANELS['audio.normalize'] = { component: NormalizePanel, width: 420, height: 400 };
PANELS['audio.trim'] = { component: AudioTrimPanel, width: 480, height: 560 };
PANELS['audio.visualize'] = { component: VisualizePanel, width: 460, height: 560 };
PANELS['audio.bleep'] = { component: BleepPanel, width: 520, height: 620 };
PANELS['audio.metadata'] = { component: MetadataPanel, width: 440, height: 640 };
PANELS['audio.join'] = { component: JoinPanel, width: 460, height: 620 };
PANELS['image.compress'] = { component: ImageCompressPanel, width: 440, height: 690 };
PANELS['image.resize'] = { component: ResizePanel, width: 420, height: 420 };
PANELS['image.crop'] = { component: ImageCropPanel, width: 440, height: 720 };
PANELS['image.edit'] = { component: EditPanel, width: 780, height: 700 };
PANELS['image.background'] = { component: BackgroundPanel, width: 780, height: 640 };
PANELS['image.redact'] = { component: ImageRedactPanel, width: 540, height: 680 };
PANELS['image.metadata'] = { component: ImageMetadataPanel, width: 460, height: 640 };
PANELS['image.collage'] = { component: CollagePanel, width: 840, height: 620 };
PANELS['image.pdf'] = { component: MakePdfPanel, width: 460, height: 620 };
PANELS['pdf.compress'] = { component: PdfCompressPanel, width: 440, height: 460 };
PANELS['pdf.merge'] = { component: MergePanel, width: 460, height: 560 };
PANELS['pdf.split'] = { component: PdfSplitPanel, width: 440, height: 480 };
PANELS['pdf.organize'] = { component: OrganizePanel, width: 920, height: 700 };
PANELS['pdf.images'] = { component: PdfImagesPanel, width: 420, height: 460 };
PANELS['pdf.ocr'] = { component: OcrPanel, width: 420, height: 460 };
PANELS['pdf.word'] = { component: WordPanel, width: 440, height: 460 };
PANELS['pdf.metadata'] = { component: PdfMetadataPanel, width: 440, height: 560 };
PANELS['subtitle.shift'] = { component: ShiftPanel, width: 420, height: 380 };
