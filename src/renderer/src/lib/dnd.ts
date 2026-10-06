import { fmtFromMime } from '@shared/formats';
import type { Fmt } from '@shared/types';
import { api } from './api';

export function pathsFromDataTransfer(dt: DataTransfer): string[] {
  return Array.from(dt.files).map((f) => api.getPathForFile(f)).filter((p) => p.length > 0);
}

/** During a drag only MIME types are readable (not paths). Used by the global drag wheel (Phase 11). */
export function fmtsFromDragTypes(dt: DataTransfer): Array<Fmt | null> {
  return Array.from(dt.items).filter((i) => i.kind === 'file').map((i) => (i.type ? fmtFromMime(i.type) : null));
}
