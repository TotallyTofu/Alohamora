import { describe, expect, it } from 'vitest';
import type { AudioNormalizeOptions, AudioTrimOptions } from '@shared/toolOptions';
import type { MediaFacts } from './ffmpegArgs';
import {
  audioMetadataArgs, bleepArgs, channelsArgs, compressAudioArgs, compressOutFmt, joinAudioArgs, loudnormPass1, loudnormPass2,
  parseLoudnorm, trimAudioArgs, visualizeArgs
} from './audioArgs';

const facts = (over: Partial<MediaFacts> = {}): MediaFacts => ({
  durationSec: 4, container: 'wav', hasVideo: false, hasAudio: true, hasCover: false, audioCodec: 'pcm_s16le', sampleRate: 44100, channels: 2, ...over
});
const Q = { crf: 23, audioKbps: 192 };
const lastValue = (a: string[], flag: string): string | undefined => a[a.lastIndexOf(flag) + 1];

describe('compress', () => {
  it('lossless inputs default to mp3, lossy ones are kept', () => {
    expect(compressOutFmt('wav', 'keep')).toBe('mp3');
    expect(compressOutFmt('flac', 'keep')).toBe('mp3');
    expect(compressOutFmt('ogg', 'keep')).toBe('ogg');
    expect(compressOutFmt('wav', 'opus')).toBe('opus');
  });

  it('builds bitrate args and optional mono', () => {
    const a = compressAudioArgs('i.wav', 'o.mp3', { bitrateKbps: 128, format: 'mp3', mono: true }, 'mp3');
    expect(a).toContain('libmp3lame');
    expect(lastValue(a, '-b:a')).toBe('128k');
    expect(lastValue(a, '-ac')).toBe('1');
    expect(() => compressAudioArgs('i', 'o', { bitrateKbps: 128, format: 'keep', mono: false }, 'wav')).toThrow();
  });
});

describe('loudnorm', () => {
  const o: AudioNormalizeOptions = { target: -16, truePeak: -1.5 };

  it('pass 1 prints JSON stats', () => {
    expect(loudnormPass1('i.wav', o).join(' ')).toContain('print_format=json');
  });

  it('parses the JSON block out of noisy stderr', () => {
    const s = parseLoudnorm('junk\n{\n"input_i" : "-23.0", "input_tp":"-5.0","input_lra":"3.0","input_thresh":"-33.0","target_offset":"0.1"\n}');
    expect(s?.input_i).toBe('-23.0');
    expect(parseLoudnorm('no json here')).toBeNull();
  });

  it('pass 2 keeps a codec-required sample rate last (Opus = 48 kHz)', () => {
    const stats = { input_i: '-23', input_tp: '-5', input_lra: '3', input_thresh: '-33', target_offset: '0.1' };
    const a = loudnormPass2('i.wav', 'o.opus', facts(), o, stats, 'opus', Q);
    expect(lastValue(a, '-ar')).toBe('48000');
    expect(a.join(' ')).toContain('measured_I=-23');
  });
});

describe('trim / channels / bleep / visualize / join', () => {
  const trim = (over: Partial<AudioTrimOptions>): AudioTrimOptions => ({ startSec: 0, endSec: 2, fadeInSec: 0, fadeOutSec: 0, ...over });

  it('trim copies without fades and re-encodes with them', () => {
    expect(trimAudioArgs('i', 'o', facts(), trim({}), 'wav', Q)).toContain('copy');
    const faded = trimAudioArgs('i', 'o', facts(), trim({ fadeOutSec: 1 }), 'wav', Q);
    expect(faded.join(' ')).toContain('afade=t=out:st=1.000');
    expect(faded).not.toContain('copy');
  });

  it('channel args come after codec args so mono wins', () => {
    const a = channelsArgs('i', 'o', facts({ channels: 6 }), 'mono', 'mp3', Q);
    expect(lastValue(a, '-ac')).toBe('1');
    expect(channelsArgs('i', 'o', facts(), 'swap', 'wav', Q).join(' ')).toContain('pan=stereo|c0=c1|c1=c0');
  });

  it('bleep builds between() expressions and mixes a tone', () => {
    const a = bleepArgs('i', 'o', facts(), {
      ranges: [{ startSec: 1, endSec: 2 }, { startSec: 3, endSec: 3.5 }], sound: 'beep', frequency: 1000
    }, 'wav', Q).join(' ');
    expect(a).toContain('between(t,1.000,2.000)+between(t,3.000,3.500)');
    expect(a).toContain('amix');
    const silence = bleepArgs('i', 'o', facts(), { ranges: [{ startSec: 1, endSec: 2 }], sound: 'silence', frequency: 1000 }, 'wav', Q).join(' ');
    expect(silence).not.toContain('amix');
  });

  it('visualize picks the right filter per kind', () => {
    const base = { width: 1920, height: 480, color: '#FF5A1F', background: '#FFFFFF' };
    expect(visualizeArgs('i', 'o.png', { ...base, kind: 'waveform-png' }).join(' ')).toContain('showwavespic=s=1920x480:colors=0xFF5A1F');
    expect(visualizeArgs('i', 'o.png', { ...base, kind: 'spectrogram-png' }).join(' ')).toContain('showspectrumpic');
    expect(visualizeArgs('i', 'o.mp4', { ...base, kind: 'waveform-mp4' })).toContain('libx264');
  });

  it('metadata keeps cover art only for formats that can hold it', () => {
    const o = { removeAll: false, tags: { title: 'Song' }, coverPath: null, removeCover: false };
    expect(audioMetadataArgs('i', 'o', o, 'mp3', true, null)).toContain('attached_pic');
    expect(audioMetadataArgs('i', 'o', o, 'wav', true, null)).not.toContain('attached_pic');
    expect(audioMetadataArgs('i', 'o', { ...o, removeAll: true }, 'mp3', true, null)).not.toContain('attached_pic');
    expect(audioMetadataArgs('i', 'o', o, 'mp3', false, 'c.jpg')).toContain('1:0');
    expect(audioMetadataArgs('i', 'o', o, 'mp3', false, null)).toContain('title=Song');
  });

  it('join concatenates with a resample/format chain', () => {
    const a = joinAudioArgs(['a.wav', 'b.mp3'], 'o.mp3', 'mp3', Q, facts());
    expect(a.filter((x) => x === '-i')).toHaveLength(2);
    expect(a.join(' ')).toContain('concat=n=2:v=0:a=1[out]');
  });
});
