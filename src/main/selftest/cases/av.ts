import { CONVERT_TARGETS } from '@shared/formats';
import type { Fmt } from '@shared/types';
import { expectCount, expectStreams } from '../assert';
import type { SelfTestCase } from '../types';

const AUDIO_CODEC: Partial<Record<Fmt, string>> = { mp3: 'mp3', m4a: 'aac', wav: 'pcm_s16le', flac: 'flac', ogg: 'vorbis', opus: 'opus', aiff: 'pcm_s16be', wma: 'wmav2' };
const VIDEO_CODEC: Partial<Record<Fmt, string>> = { mp4: 'h264', mov: 'h264', mkv: 'h264', webm: 'vp9', avi: 'mpeg4', wmv: 'wmv2', gif: 'gif' };

export const AV_CASES: SelfTestCase[] = [
  ...CONVERT_TARGETS.audio.filter((t) => t !== 'wav').map((t): SelfTestCase => ({
    name: `convert.audio.wav-${t}`, group: 'av', fixtures: ['audio.wav'],
    request: (i) => ({ kind: 'convert', inputs: i, target: t }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { audio: AUDIO_CODEC[t], durationSec: 4 }); }
  })),
  {
    name: 'convert.audio.mp3-wav', group: 'av', fixtures: ['audio.mp3'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'wav' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { audio: 'pcm_s16le', durationSec: 4 }); }
  },
  ...CONVERT_TARGETS.video.filter((t) => t !== 'mp4').map((t): SelfTestCase => ({
    name: `convert.video.mp4-${t}`, group: 'av', fixtures: ['video.mp4'],
    request: (i) => ({ kind: 'convert', inputs: i, target: t }),
    check: async (o) => {
      expectCount(o, 1);
      if (t === 'mp3') await expectStreams(o[0], { audio: 'mp3', video: null, durationSec: 4 });
      else await expectStreams(o[0], { video: VIDEO_CODEC[t], durationSec: 4, tolerance: 0.6 });
    }
  })),
  {
    name: 'convert.video.mkv-mp4-remux', group: 'av', fixtures: ['video.mkv'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp4' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { video: 'h264', audio: 'aac', durationSec: 4 }); }
  },
  {
    name: 'convert.video.gif-mp4', group: 'av', fixtures: ['anim.gif'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp4' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { video: 'h264', audio: null }); }
  },
  {
    name: 'convert.video.noaudio-mp3-fails', group: 'av', fixtures: ['video-noaudio.mp4'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp3' }),
    expectError: /no audio/i
  }
];
