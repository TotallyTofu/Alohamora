import { describe, expect, it } from 'vitest';
import {
  EVEN_SCALE, audioConvertArgs, canRemux, toFacts, videoConvertArgs, videoFilter, wmvBitrate, type MediaFacts
} from './ffmpegArgs';

const Q = { crf: 23, audioKbps: 192 };

function facts(over: Partial<MediaFacts> = {}): MediaFacts {
  return {
    durationSec: 4, container: 'matroska,webm', hasVideo: true, hasAudio: true, hasCover: false,
    videoCodec: 'h264', audioCodec: 'aac', width: 640, height: 360, fps: 30, sampleRate: 48000, channels: 2, ...over
  };
}

/** Value following `flag` in an args array. */
const after = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

describe('videoConvertArgs', () => {
  it('remuxes MKV h264/aac into MP4 without re-encoding', () => {
    const a = videoConvertArgs('in.mkv', 'out.mp4', facts(), 'mp4', Q);
    expect(a).toContain('-c');
    expect(after(a, '-c')).toBe('copy');
    expect(a).toContain('+faststart');
    expect(a).not.toContain('libx264');
  });

  it('tags HEVC remuxes as hvc1 for Apple players', () => {
    const a = videoConvertArgs('in.mkv', 'out.mp4', facts({ videoCodec: 'hevc' }), 'mp4', Q);
    expect(after(a, '-tag:v')).toBe('hvc1');
  });

  it('re-encodes vp9/opus into MP4 with an even-size guard', () => {
    const a = videoConvertArgs('in.webm', 'out.mp4', facts({ videoCodec: 'vp9', audioCodec: 'opus' }), 'mp4', Q);
    expect(a).toContain('libx264');
    expect(after(a, '-vf')?.endsWith(EVEN_SCALE)).toBe(true);
  });

  it('encodes h264/aac into WebM with VP9 + Opus', () => {
    const a = videoConvertArgs('in.mp4', 'out.webm', facts(), 'webm', Q);
    expect(a).toContain('libvpx-vp9');
    expect(a).toContain('libopus');
  });

  it('GIF: palette chain, no audio, no audio map', () => {
    const a = videoConvertArgs('in.mp4', 'out.gif', facts(), 'gif', Q, { width: 320, fps: 10 });
    expect(after(a, '-vf')).toContain('palettegen');
    expect(a).toContain('-an');
    expect(a).not.toContain('0:a:0?');
  });

  it('video → mp3 delegates to the audio builder', () => {
    const a = videoConvertArgs('in.mp4', 'out.mp3', facts(), 'mp3', Q);
    expect(a).toContain('libmp3lame');
    expect(a).toContain('-vn');
  });

  it('adds -an when the source has no audio', () => {
    const a = videoConvertArgs('in.webm', 'out.mp4', facts({ hasAudio: false, videoCodec: 'vp9' }), 'mp4', Q);
    expect(a).toContain('-an');
  });
});

describe('audioConvertArgs', () => {
  it('downsamples 96 kHz sources for MP3 and always uses 48 kHz for Opus', () => {
    const f = facts({ hasVideo: false, sampleRate: 96000, audioCodec: 'pcm_s24le' });
    const mp3 = audioConvertArgs('in.wav', 'out.mp3', f, 'mp3', Q, false);
    expect(after(mp3, '-ar')).toBe('48000');
    const opus = audioConvertArgs('in.wav', 'out.opus', facts({ hasVideo: false, sampleRate: 44100 }), 'opus', Q, false);
    expect(after(opus, '-ar')).toBe('48000');
  });

  it('keeps cover art only for formats that can hold it', () => {
    const f = facts({ hasVideo: false, hasCover: true });
    expect(audioConvertArgs('in.mp3', 'out.m4a', f, 'm4a', Q, true)).toContain('attached_pic');
    expect(audioConvertArgs('in.mp3', 'out.wav', f, 'wav', Q, true)).toContain('-vn');
    expect(audioConvertArgs('in.mp3', 'out.m4a', f, 'm4a', Q, false)).toContain('-vn');
  });

  it('downmixes surround sources to stereo for MP3', () => {
    const a = audioConvertArgs('in.wav', 'out.mp3', facts({ channels: 6, hasVideo: false }), 'mp3', Q, false);
    expect(after(a, '-ac')).toBe('2');
  });

  it('throws for an unknown audio target', () => {
    expect(() => audioConvertArgs('a', 'b', facts(), 'png', Q, false)).toThrow();
  });
});

describe('canRemux', () => {
  it('is false without video', () => {
    expect(canRemux(facts({ hasVideo: false }), 'mp4')).toBe(false);
  });

  it('is false for incompatible audio and true for audio-less video', () => {
    expect(canRemux(facts({ audioCodec: 'vorbis' }), 'mp4')).toBe(false);
    expect(canRemux(facts({ hasAudio: false, audioCodec: undefined }), 'mp4')).toBe(true);
  });

  it('is false for targets with no copy rule (gif)', () => {
    expect(canRemux(facts(), 'gif')).toBe(false);
  });
});

describe('misc helpers', () => {
  it('videoFilter appends the even-size guard for normal targets', () => {
    expect(videoFilter('mp4', ['crop=100:100:0:0'])).toBe(`crop=100:100:0:0,${EVEN_SCALE}`);
  });

  it('wmvBitrate scales with resolution', () => {
    expect(wmvBitrate(facts({ width: 640, height: 360 }))).toBe('1500k');
    expect(wmvBitrate(facts({ width: 3840, height: 2160 }))).toBe('12000k');
  });

  it('toFacts maps a probe result', () => {
    const f = toFacts({
      durationSec: 3, formatName: 'mov,mp4', bitRate: 0, hasCover: false, tags: {},
      video: { codec: 'h264', width: 1920, height: 1080, displayWidth: 1080, displayHeight: 1920, fps: 30, pixFmt: 'yuv420p', rotation: 90 },
      audio: { codec: 'aac', sampleRate: 48000, channels: 2, bitRate: 1 }
    });
    expect(f).toMatchObject({ hasVideo: true, hasAudio: true, width: 1080, height: 1920, videoCodec: 'h264' });
  });
});
