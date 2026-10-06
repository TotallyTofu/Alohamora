import { create } from 'zustand';
import type { Capabilities, FileInfo, Fmt, JobUpdate, OverlayInit, ToolId, WheelMode } from '@shared/types';

export type Stage =
  | { name: 'empty' }
  | { name: 'wheel' }
  | { name: 'options'; target: Fmt }
  | { name: 'panel'; toolId: ToolId }
  | { name: 'running'; jobId: string }
  | { name: 'done'; job: JobUpdate }
  | { name: 'error'; message: string; details?: string };

interface OverlayState {
  files: FileInfo[];
  mode: WheelMode;
  caps: Capabilities | null;
  source: OverlayInit['source'];
  stage: Stage;
  active: number | null;
  dragging: boolean;
  init: (p: OverlayInit) => void;
  mergeFiles: (deep: FileInfo[]) => void;
  setMode: (m: WheelMode) => void;
  setActive: (i: number | null) => void;
  go: (s: Stage) => void;
}

export const useOverlay = create<OverlayState>()((set) => ({
  files: [],
  mode: 'convert',
  caps: null,
  source: 'window',
  stage: { name: 'empty' },
  active: null,
  dragging: false,
  init: (p) => set({ files: p.files, mode: p.mode, caps: p.caps, source: p.source, stage: { name: 'wheel' }, active: null, dragging: false }),
  mergeFiles: (deep) => set((s) => ({ files: s.files.map((f) => deep.find((d) => d.path === f.path) ?? f) })),
  setMode: (mode) => set({ mode, active: null }),
  setActive: (active) => set({ active }),
  go: (stage) => set({ stage })
}));
