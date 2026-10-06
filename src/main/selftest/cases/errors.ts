import type { JobRequest } from '@shared/types';
import type { SelfTestCase } from '../types';

/** Appendix C: each situation must show a plain-language message instead of a raw tool error. */
function errorCase(
  name: string, fixtures: string[], request: (i: string[]) => JobRequest, expectError: RegExp, skip?: SelfTestCase['skip']
): SelfTestCase {
  return { name: `errors.${name}`, group: 'errors', fixtures, request, expectError, skip };
}

export const ERROR_CASES: SelfTestCase[] = [
  errorCase('fake-video', ['fake.mp4'], (i) => ({ kind: 'convert', inputs: i, target: 'mkv' }), /damaged|not really the format/i),
  errorCase('fake-audio', ['fake.mp3'], (i) => ({ kind: 'convert', inputs: i, target: 'wav' }), /damaged|not really the format/i),
  errorCase('broken-image', ['broken.png'], (i) => ({ kind: 'convert', inputs: i, target: 'jpg' }), /couldn't read this image/i),
  errorCase('broken-pdf', ['broken.pdf'], (i) => ({ kind: 'convert', inputs: i, target: 'txt' }), /could not be opened|damaged/i),
  errorCase('mute-without-audio', ['video-noaudio.mp4'], (i) => ({ kind: 'tool', inputs: i, toolId: 'video.mute', options: {} }), /no audio to remove/i),
  errorCase('compress-target-too-small', ['video.mp4'],
    (i) => ({ kind: 'tool', inputs: i, toolId: 'video.compress', options: { targetSizeMb: 0.001 } }), /too small/i),
  errorCase('heic-without-encoder', ['image.png'], (i) => ({ kind: 'convert', inputs: i, target: 'heic' }), /HEIC output is not available/i,
    (c) => (c.heifEnc ? 'a HEIC encoder exists on this machine' : false)),
  errorCase('scanned-pdf-ocr-off', ['scan.pdf'], (i) => ({ kind: 'convert', inputs: i, target: 'txt', options: { ocr: 'off' } }), /no text layer/i),
  errorCase('trim-too-short', ['video.mp4'], (i) => ({ kind: 'tool', inputs: i, toolId: 'video.trim', options: { startSec: 1, endSec: 1.01 } }), /too short/i),
  errorCase('split-single-cut', ['video.mp4'], (i) => ({ kind: 'tool', inputs: i, toolId: 'video.split', options: { mode: 'at', times: [] } }), /at least one cut/i),
  errorCase('wrong-kind-for-tool', ['doc.pdf'], (i) => ({ kind: 'tool', inputs: i, toolId: 'video.trim', options: {} }), /damaged|not really the format|no video track/i)
];
