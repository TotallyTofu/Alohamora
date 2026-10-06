import sharp from 'sharp';
import type { ToolId } from '@shared/types';
import { probe } from '../../engines/ffmpeg';
import { check, expectCount, expectStreams } from '../assert';
import type { SelfTestCase } from '../types';

function toolCase(
  name: string, fixtures: string[], toolId: ToolId, options: Record<string, unknown>, verify: (o: string[]) => Promise<void>
): SelfTestCase {
  return {
    name: `tools.audio.${name}`, group: 'tools.audio', fixtures,
    request: (inputs) => ({ kind: 'tool', inputs, toolId, options }),
    check: verify
  };
}

export const AUDIO_TOOL_CASES: SelfTestCase[] = [
  toolCase('compress', ['audio.wav'], 'audio.compress', { bitrateKbps: 128, format: 'keep' }, async (o) => {
    expectCount(o, 1);
    check(o[0].endsWith('.mp3'), `WAV should compress to MP3, got ${o[0]}`);
    await expectStreams(o[0], { audio: 'mp3', durationSec: 4 });
  }),
  toolCase('channels-mono', ['audio.wav'], 'audio.channels', { mode: 'mono' }, async (o) => {
    expectCount(o, 1);
    check((await probe(o[0])).audio?.channels === 1, 'expected 1 channel');
  }),
  toolCase('channels-swap', ['stereo-lr.wav'], 'audio.channels', { mode: 'swap' }, async (o) => {
    expectCount(o, 1);
    check((await probe(o[0])).audio?.channels === 2, 'expected 2 channels');
  }),
  {
    name: 'tools.audio.channels-left-on-mono-fails', group: 'tools.audio', fixtures: ['audio-mono.wav'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'audio.channels', options: { mode: 'left' } }),
    expectError: /mono/i
  },
  toolCase('normalize', ['audio.wav'], 'audio.normalize', { target: -16, truePeak: -1.5 }, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { audio: 'pcm_s16le', durationSec: 4, tolerance: 0.3 });
  }),
  {
    name: 'tools.audio.normalize-silent-fails', group: 'tools.audio', fixtures: ['audio-silent.wav'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'audio.normalize', options: {} }),
    expectError: /silent/i
  },
  toolCase('trim-fade', ['audio.wav'], 'audio.trim', { startSec: 1, endSec: 3, fadeInSec: 0.5 }, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { audio: 'pcm_s16le', durationSec: 2, tolerance: 0.1 });
  }),
  toolCase('visualize-png', ['audio.wav'], 'audio.visualize', { kind: 'waveform-png', width: 1920, height: 480 }, async (o) => {
    expectCount(o, 1);
    const m = await sharp(o[0]).metadata();
    check(m.format === 'png' && m.width === 1920 && m.height === 480, `expected 1920x480 PNG, got ${m.format} ${m.width}x${m.height}`);
  }),
  toolCase('visualize-mp4', ['audio.wav'], 'audio.visualize', { kind: 'waveform-mp4', width: 640, height: 360 }, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { video: 'h264', audio: 'aac' });
  }),
  toolCase('bleep', ['audio.wav'], 'audio.bleep', { ranges: [{ startSec: 1, endSec: 2 }], sound: 'beep', frequency: 1000 }, async (o) => {
    expectCount(o, 1);
    await expectStreams(o[0], { audio: 'pcm_s16le', durationSec: 4, tolerance: 0.2 });
  }),
  toolCase('metadata-title', ['audio.mp3'], 'audio.metadata', { tags: { title: 'Song' } }, async (o) => {
    expectCount(o, 1);
    check((await probe(o[0])).tags.title === 'Song', 'title tag should be Song');
  }),
  toolCase('join', ['audio.wav', 'audio.mp3'], 'audio.join', {}, async (o) => {
    expectCount(o, 1);
    const d = (await probe(o[0])).durationSec;
    check(Math.abs(d - 8) <= 0.3, `expected ~8 s, got ${d}`);
  })
];
