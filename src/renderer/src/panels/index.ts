import type { ComponentType } from 'react';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt, ToolId } from '@shared/types';
import { GenericCard } from './convert/GenericCard';
import { GifCard } from './convert/GifCard';

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
