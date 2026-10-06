export interface OverlaySize { width: number; height: number; anchor: 'wheel' | 'center' }

/** Overlay window while showing the wheel. The wheel centre (anchorX, anchorY) is placed at the cursor. */
export const WHEEL_STAGE = { width: 440, height: 500, anchorX: 220, anchorY: 210 } as const;
export const WHEEL_SIZE = 340;   // svg box; top-left inside the window = (50, 40)
