import { REQUIRED_ENCODERS } from './formats';
import type { Capabilities } from './types';

/** Test helper: a fully-populated Capabilities object. */
export function makeCaps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    platform: 'win32', arch: 'x64', appVersion: '0.0.0', ffmpeg: true, ffmpegVersion: 'test',
    encoders: [...new Set(Object.values(REQUIRED_ENCODERS).flat() as string[])],
    heifEnc: false, heicTool: null, hwVideo: null, globalDrag: 'hook', ocrLanguages: ['eng'], ...over
  };
}
