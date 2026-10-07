import { useEffect, useRef } from 'react';
import type { DropEvent } from '@shared/ipc';
import { api } from './api';

/**
 * Native file drag-and-drop on this window (Tauri's drag-drop handler; HTML5 file drops do not exist).
 * The handler gets every phase; `paths` is remembered from 'enter' because 'over' carries none.
 */
export function useNativeDrop(handler: (e: DropEvent, paths: string[]) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let paths: string[] = [];
    return api.onDrop((e) => {
      if (e.paths) paths = e.paths;
      latest.current(e, paths);
      if (e.phase === 'drop' || e.phase === 'leave') paths = [];
    });
  }, []);
}

/** True when the point (CSS pixels, like clientX/clientY) is over an element matching `selector`. */
export function isOver(x: number, y: number, selector: string): boolean {
  return document.elementFromPoint(x, y)?.closest(selector) != null;
}
