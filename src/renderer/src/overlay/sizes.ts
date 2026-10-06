import { WHEEL_STAGE, type OverlaySize } from '@shared/overlay';
import type { FileInfo } from '@shared/types';
import { PANELS, convertCardFor } from '../panels';
import type { Stage } from './store';

const MARGIN = 48;   // transparent space around cards for their shadow

export function sizeForStage(stage: Stage, files: FileInfo[]): OverlaySize {
  switch (stage.name) {
    case 'empty':
    case 'wheel':
      return { width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, anchor: 'wheel' };
    case 'options': {
      const cats = new Set(files.map((f) => f.category));
      const d = convertCardFor(cats.size === 1 ? [...cats][0] : null, stage.target);
      return { width: (d?.width ?? 420) + MARGIN, height: (d?.height ?? 420) + MARGIN, anchor: 'center' };
    }
    case 'panel': {
      const d = PANELS[stage.toolId];
      return { width: (d?.width ?? 440) + MARGIN, height: (d?.height ?? 520) + MARGIN, anchor: 'center' };
    }
    case 'running':
    case 'done':
      return { width: 380 + MARGIN, height: 320 + MARGIN, anchor: 'center' };
    case 'error':
      return { width: 440 + MARGIN, height: 380 + MARGIN, anchor: 'center' };
  }
}
