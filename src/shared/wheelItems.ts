import { CONVERT_TARGETS, FORMATS, needsOptions, targetAvailable } from './formats';
import { toolsFor } from './tools';
import type { Capabilities, Category, FileInfo, Fmt, ToolId, WheelMode } from './types';

export const MAX_SLICES = 12;

export interface WheelItem {
  key: string;
  label: string;
  icon?: string;
  kind: 'format' | 'tool';
  target?: Fmt;
  toolId?: ToolId;
  needsOptions: boolean;
}

export interface WheelModel {
  items: WheelItem[];
  emptyReason?: string;
  category: Category | null;   // null when mixed or unknown
  mixed: boolean;
}

export function buildWheel(files: FileInfo[], mode: WheelMode, caps: Capabilities): WheelModel {
  const supported = files.filter((f) => f.category !== null);
  if (supported.length === 0) {
    return { items: [], emptyReason: "This file type isn't supported yet", category: null, mixed: false };
  }
  const cats = new Set<Category>(supported.map((f) => f.category as Category));
  const mixed = cats.size > 1;
  const category = mixed ? null : [...cats][0];

  if (mode === 'tools') {
    if (!category) return { items: [], emptyReason: 'Mixed file types — drop files of one kind to see tools', category, mixed };
    const tools = toolsFor(category, supported.length);
    if (tools.length === 0) return { items: [], emptyReason: 'No tools for this file type yet', category, mixed };
    return {
      items: tools.slice(0, MAX_SLICES).map((t) => ({
        key: t.id, label: t.label, icon: t.icon, kind: 'tool' as const, toolId: t.id, needsOptions: !t.instant
      })),
      category,
      mixed
    };
  }

  let targets: Fmt[] | null = null;
  for (const c of cats) {
    const list = CONVERT_TARGETS[c].filter((t) => targetAvailable(t, c, caps));
    targets = targets === null ? list : targets.filter((t) => list.includes(t));
  }
  const finalTargets = (targets ?? []).filter((t) => !supported.every((f) => f.fmt === t));
  if (finalTargets.length === 0) {
    return { items: [], emptyReason: 'No shared conversion — drop files of one kind', category, mixed };
  }
  return {
    items: finalTargets.slice(0, MAX_SLICES).map((t) => ({
      key: `to-${t}`,
      label: FORMATS[t].label,
      kind: 'format' as const,
      target: t,
      needsOptions: category !== null && needsOptions(category, t)
    })),
    category,
    mixed
  };
}
