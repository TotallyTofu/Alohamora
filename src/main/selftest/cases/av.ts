import { CONVERT_TARGETS } from '@shared/formats';
import type { Fmt } from '@shared/types';
import { ffprobePath } from '../../paths';
import { runProcess } from '../../engines/process';
import { check, expectCount, expectStreams } from '../assert';
import type { SelfTestCase } from '../types';

/** The encoder that wrote the first video stream (e.g. "Lavc63 libx264" or "Lavc63 h264_nvenc"). */
async function videoEncoderTag(file: string): Promise<string> {
  const r = await runProcess(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_tags=encoder', '-of', 'default=nw=1:nk=1', file]);
  return r.stdout.toString().trim();
}

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
    // VP9 cannot be remuxed into MOV, so this really encodes — and with a verified hardware encoder it must use it.
    name: 'convert.video.vp9-mov-hw', group: 'av', fixtures: ['video-vp9.webm'],
    skip: (c) => (c.hwVideo ? false : 'no verified hardware video encoder on this machine'),
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mov' }),
    check: async (o) => {
      expectCount(o, 1);
      await expectStreams(o[0], { video: 'h264', durationSec: 3, tolerance: 0.6 });
      const tag = await videoEncoderTag(o[0]);
      check(!/libx264/.test(tag), `expected a hardware encoder, got "${tag}"`);
    }
  },
  {
    // A broken hardware encoder must silently fall back to the CPU (libx264), so the job still succeeds.
    name: 'convert.video.vp9-mov-hw-fallback', group: 'av', fixtures: ['video-vp9.webm'], capsOverride: { hwVideo: 'h264_this_encoder_does_not_exist' },
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mov' }),
    check: async (o) => {
      expectCount(o, 1);
      await expectStreams(o[0], { video: 'h264', durationSec: 3, tolerance: 0.6 });
      const tag = await videoEncoderTag(o[0]);
      check(/libx264/.test(tag), `expected the CPU fallback (libx264), got "${tag}"`);
    }
  },
  {
    name: 'convert.video.noaudio-mp3-fails', group: 'av', fixtures: ['video-noaudio.mp4'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp3' }),
    expectError: /no audio/i
  }
];
