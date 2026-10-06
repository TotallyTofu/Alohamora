import sharp from 'sharp';
import type { ToolId } from '@shared/types';
import { probe } from '../../engines/ffmpeg';
import { check, expectCount, expectStreams } from '../assert';
import type { SelfTestCase } from '../types';

function toolCase(
  name: string, fixtures: string[], toolId: ToolId, options: Record<string, unknown>, verify: (o: string[]) => Promise<void>
): SelfTestCase {
  return {
    name: `tools.video.${name}`, group: 'tools.video', fixtures,
    request: (inputs) => ({ kind: 'tool', inputs, toolId, options }),
    check: verify
  };
}

export const VIDEO_TOOL_CASES: SelfTestCase[] = [
  toolCase('compress', ['video.mp4'], 'video.compress', { preset: 'small', maxHeight: 240 }, async (o) => {
    expectCount(o, 1);
    const p = await probe(o[0]);
    check(p.video?.displayHeight === 240, `expected height 240, got ${p.video?.displayHeight}`);
    check(p.video?.codec === 'h264', `expected h264, got ${p.video?.codec}`);
  }),
  toolCase('trim-precise', ['video.mp4'], 'video.trim', { startSec: 1, endSec: 3, precise: true }, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { video: 'h264', durationSec: 2, tolerance: 0.25 });
  }),
  toolCase('trim-fast', ['video.mp4'], 'video.trim', { startSec: 1, endSec: 3, precise: false }, async (o) => {
    expectCount(o, 1);
    const d = (await probe(o[0])).durationSec;
    check(d >= 1.5 && d <= 3.3, `fast trim duration should be 1.5–3.3 s, got ${d}`);
  }),
  toolCase('split-parts', ['video.mp4'], 'video.split', { mode: 'parts', parts: 2 }, async (o) => { expectCount(o, 2); }),
  toolCase('crop', ['video.mp4'], 'video.crop', { rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }, async (o) => {
    expectCount(o, 1);
    const v = (await probe(o[0])).video;
    check(v?.displayWidth === 320 && v?.displayHeight === 180, `expected 320x180, got ${v?.displayWidth}x${v?.displayHeight}`);
  }),
  {
    name: 'tools.video.crop-full-rect-fails', group: 'tools.video', fixtures: ['video.mp4'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'video.crop', options: {} }),
    expectError: /whole frame/i
  },
  toolCase('speed-2x', ['video.mp4'], 'video.speed', { factor: 2, keepAudio: true }, async (o) => {
    expectCount(o, 1);
    const p = await probe(o[0]);
    check(Math.abs(p.durationSec - 2) <= 0.3, `expected ~2 s, got ${p.durationSec}`);
    check(!!p.audio, 'audio should be kept');
  }),
  toolCase('mute', ['video.mp4'], 'video.mute', {}, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { audio: null, video: 'h264' });
  }),
  toolCase('snapshot-single', ['video.mp4'], 'video.snapshot', { mode: 'single', timeSec: 1, format: 'png' }, async (o) => {
    expectCount(o, 1);
    const m = await sharp(o[0]).metadata();
    check(m.format === 'png' && m.width === 640 && m.height === 360, `expected 640x360 PNG, got ${m.format} ${m.width}x${m.height}`);
  }),
  toolCase('snapshot-every', ['video.mp4'], 'video.snapshot', { mode: 'every', everySec: 1, format: 'jpg' }, async (o) => {
    check(o.length === 4 || o.length === 5, `expected 4 or 5 frames, got ${o.length}`);
  }),
  toolCase('redact-blur', ['video.mp4'], 'video.redact',
    { regions: [{ rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, style: 'blur' }] }, async (o) => {
      expectCount(o, 1);
      const p = await probe(o[0]);
      check(p.video?.codec === 'h264' && p.video.displayWidth === 640 && p.video.displayHeight === 360, 'redacted video should stay h264 640x360');
      check(!p.tags.title, 'metadata should have been stripped');
    }),
  toolCase('metadata-set-title', ['video.mp4'], 'video.metadata', { tags: { title: 'Hello' } }, async (o) => {
    expectCount(o, 1);
    check((await probe(o[0])).tags.title === 'Hello', 'title tag should be Hello');
  }),
  toolCase('metadata-remove-all', ['titled.mp4'], 'video.metadata', { removeAll: true }, async (o) => {
    expectCount(o, 1);
    check(!(await probe(o[0])).tags.title, 'title tag should be gone');
  }),
  toolCase('join-same', ['video.mp4', 'video-copy.mp4'], 'video.join', {}, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { video: 'h264', audio: 'aac', durationSec: 8, tolerance: 0.3 });
  }),
  toolCase('join-mixed', ['video.mp4', 'video-noaudio.mp4'], 'video.join', {}, async (o) => {
    expectCount(o, 1);
    const p = await probe(o[0]);
    check(Math.abs(p.durationSec - 6) <= 0.4, `expected ~6 s, got ${p.durationSec}`);
    check(!!p.audio, 'joined clip should have audio');
  })
];
