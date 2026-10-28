import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVERT_OPTIONS, DEFAULT_EDIT, TOOL_DEFAULTS, withDefaults, type ImageCropOptions, type VideoTrimOptions } from './toolOptions';

describe('withDefaults', () => {
  it('fills every missing option and keeps the given ones', () => {
    expect(withDefaults<VideoTrimOptions>('video.trim', { startSec: 3 })).toEqual({ startSec: 3, endSec: 0, precise: false });
    expect(withDefaults('video.trim', undefined)).toEqual(TOOL_DEFAULTS['video.trim']);
    expect(withDefaults('video.mute', {})).toEqual({});
  });

  it('returns a new object, so changing it never changes the defaults', () => {
    const o = withDefaults<VideoTrimOptions>('video.trim', undefined);
    o.startSec = 99;
    expect(TOOL_DEFAULTS['video.trim'].startSec).toBe(0);
  });

  it('replaces nested objects as a whole (shallow merge)', () => {
    const o = withDefaults<ImageCropOptions>('image.crop', { rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    expect(o.rect).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(o.rotate).toBe(0);
  });
});

describe('defaults', () => {
  it('the edit sliders start at zero with no effect', () => {
    expect(Object.entries(DEFAULT_EDIT).filter(([k]) => k !== 'effect').every(([, v]) => v === 0)).toBe(true);
    expect(DEFAULT_EDIT.effect).toBe('none');
    expect(TOOL_DEFAULTS['image.edit']).toEqual(DEFAULT_EDIT);
  });

  it('convert options stay inside the ranges their cards allow', () => {
    const c = DEFAULT_CONVERT_OPTIONS;
    expect(c.quality).toBeGreaterThanOrEqual(1);
    expect(c.quality).toBeLessThanOrEqual(100);
    expect(c.svgColors).toBeGreaterThanOrEqual(2);
    expect(c.svgColors).toBeLessThanOrEqual(32);
    expect(c.secondsPerCue).toBeGreaterThan(0);
  });
});
