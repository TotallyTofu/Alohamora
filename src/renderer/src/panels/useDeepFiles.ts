import type { FileInfo } from '@shared/types';
import { useOverlay } from '../overlay/store';

/** Returns the files once deep inspection has arrived (width/height/duration known), else null. */
export function useDeepFiles(): FileInfo[] | null {
  const files = useOverlay((s) => s.files);
  return files.length > 0 && files.every((f) => f.deep) ? files : null;
}
