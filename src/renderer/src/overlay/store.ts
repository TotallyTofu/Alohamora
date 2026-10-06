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
  dragFmts: Array<Fmt | null>;
  init: (p: OverlayInit) => void;
  mergeFiles: (deep: FileInfo[]) => void;
  setMode: (m: WheelMode) => void;
  setActive: (i: number | null) => void;
  go: (s: Stage) => void;
  /** A global file drag started: show the wheel before the drop (files unknown until the drop, except on macOS). */
  startDrag: (mode: WheelMode) => void;
  setDragFmts: (fmts: Array<Fmt | null>) => void;
  /** macOS: the helper read the real dragged files. */
  setDragFiles: (files: FileInfo[]) => void;
  dropFinished: (files: FileInfo[]) => void;
  endDrag: () => void;
}

export const useOverlay = create<OverlayState>()((set) => ({
  files: [],
  mode: 'convert',
  caps: null,
  source: 'window',
  stage: { name: 'empty' },
  active: null,
  dragging: false,
  dragFmts: [],
  init: (p) => set({ files: p.files, mode: p.mode, caps: p.caps, source: p.source, stage: { name: 'wheel' }, active: null, dragging: false, dragFmts: [] }),
  mergeFiles: (deep) => set((s) => ({ files: s.files.map((f) => deep.find((d) => d.path === f.path) ?? f) })),
  setMode: (mode) => set({ mode, active: null }),
  setActive: (active) => set({ active }),
  go: (stage) => set({ stage }),
  startDrag: (mode) => set({ dragging: true, files: [], mode, stage: { name: 'wheel' }, active: null, dragFmts: [] }),
  setDragFmts: (dragFmts) => set({ dragFmts }),
  setDragFiles: (files) => set({ files }),
  dropFinished: (files) => set({ files, dragging: false }),
  endDrag: () => set({ dragging: false })
}));
