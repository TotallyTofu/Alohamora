import { describe, expect, it } from 'vitest';
import { splitSegments } from '@shared/split';
import type { VideoCompressOptions, VideoSplitOptions } from '@shared/toolOptions';
import type { MediaFacts } from './ffmpegArgs';
import {
  atempoChain, canConcatCopy, capSize, compressPlan, concatListFile, cropArgs, metadataArgs, muteArgs, redactGraph,
  speedArgs, targetVideoKbps, trimArgs
} from './videoArgs';

const facts = (over: Partial<MediaFacts> = {}): MediaFacts => ({
  durationSec: 60, container: 'mov,mp4', hasVideo: true, hasAudio: true, hasCover: false, videoCodec: 'h264', audioCodec: 'aac',
  width: 1920, height: 1080, fps: 30, sampleRate: 48000, channels: 2, ...over
});
const Q = { crf: 20, audioKbps: 192 };
const compress = (over: Partial<VideoCompressOptions> = {}): VideoCompressOptions =>
  ({ preset: 'balanced', maxHeight: 0, codec: 'h264', targetSizeMb: 0, ...over });
const split = (over: Partial<VideoSplitOptions>): VideoSplitOptions =>
  ({ mode: 'parts', times: [], parts: 2, everySec: 60, precise: false, ...over });
const after = (a: string[], flag: string): string | undefined => a[a.indexOf(flag) + 1];

describe('capSize / targetVideoKbps', () => {
  it('caps the SHORT side and keeps even numbers', () => {
    expect(capSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(capSize(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
    expect(capSize(640, 360, 720)).toBeNull();
    expect(capSize(1920, 1080, 0)).toBeNull();
  });

  it('computes the video bitrate for a target size', () => {
    expect(targetVideoKbps(10, 60, 128)).toBe(1237);
  });
});

describe('compressPlan', () => {
  it('is a single CRF pass by default', () => {
    const plan = compressPlan('in.mp4', 'out.mp4', facts(), compress(), 'mp4', 'log');
    expect(plan).toHaveLength(1);
    expect(plan[0]).toContain('libx264');
    expect(after(plan[0], '-crf')).toBe('24');
  });

  it('target size gives two passes; the first discards output', () => {
    const plan = compressPlan('in.mp4', 'out.mp4', facts(), compress({ targetSizeMb: 10 }), 'mp4', 'log');
    expect(plan).toHaveLength(2);
    const i = plan[0].indexOf('-pass');
    expect(plan[0].slice(i, i + 2)).toEqual(['-pass', '1']);
    expect(plan[0][plan[0].length - 1]).toBe('-');
    expect(plan[1][plan[1].length - 1]).toBe('out.mp4');
  });

  it('H.265 and WebM pick their encoders; resolution cap adds a scale', () => {
    expect(compressPlan('i', 'o', facts(), compress({ codec: 'h265' }), 'mp4', 'l')[0]).toContain('libx265');
    expect(compressPlan('i', 'o', facts(), compress(), 'webm', 'l')[0]).toContain('libvpx-vp9');
    expect(after(compressPlan('i', 'o', facts(), compress({ maxHeight: 720 }), 'mp4', 'l')[0], '-vf')).toContain('scale=1280:720');
  });
});

describe('splitSegments', () => {
  it('parts / every / at', () => {
    expect(splitSegments(9, split({ mode: 'parts', parts: 3 }))).toEqual([{ start: 0, end: 3 }, { start: 3, end: 6 }, { start: 6, end: 9 }]);
    const every = splitSegments(10, split({ mode: 'every', everySec: 4 }));
    expect(every).toHaveLength(3);
    expect(every[2].end).toBe(10);
    expect(splitSegments(10, split({ mode: 'at', times: [5, 0, 20] }))).toEqual([{ start: 0, end: 5 }, { start: 5, end: 10 }]);
  });
});

describe('speed / mute / trim / crop / metadata', () => {
  it('atempoChain splits factors outside 0.5..2', () => {
    expect(atempoChain(4)).toBe('atempo=2.0,atempo=2.0000');
    expect(atempoChain(0.25)).toBe('atempo=0.5,atempo=0.5000');
    expect(atempoChain(1.5)).toBe('atempo=1.5000');
  });

  it('speed with audio uses filter_complex; without it uses -vf and no audio', () => {
    expect(speedArgs('i', 'o', facts(), 2, true, 'mp4', Q)).toContain('-filter_complex');
    const mute = speedArgs('i', 'o', facts(), 2, false, 'mp4', Q);
    expect(mute).toContain('-vf');
    expect(mute).toContain('-an');
  });

  it('mute copies video and drops audio', () => {
    const a = muteArgs('i.mp4', 'o.mp4', 'mp4');
    expect(a).toContain('-an');
    expect(after(a, '-c')).toBe('copy');
  });

  it('fast trim copies streams, precise trim re-encodes', () => {
    expect(after(trimArgs('i', 'o', facts(), 1, 3, false, 'mp4', Q), '-c')).toBe('copy');
    expect(trimArgs('i', 'o', facts(), 1, 3, true, 'mp4', Q)).toContain('libx264');
  });

  it('crop builds a crop filter', () => {
    expect(after(cropArgs('i', 'o', facts(), { x: 10, y: 20, w: 100, h: 50 }, 'mp4', Q), '-vf')).toContain('crop=100:50:10:20');
  });

  it('metadata remove-all strips with -map_metadata -1', () => {
    const a = metadataArgs('i', 'o', { removeAll: true, tags: {} }, 'mp4');
    expect(after(a, '-map_metadata')).toBe('-1');
    const b = metadataArgs('i', 'o', { removeAll: false, tags: { title: 'T' } }, 'mkv');
    expect(b).toContain('title=T');
  });
});

describe('redactGraph / concat', () => {
  it('chains blur and black regions', () => {
    const g = redactGraph([
      { rect: { x: 10, y: 10, w: 200, h: 100 }, style: 'blur' },
      { rect: { x: 0, y: 0, w: 50, h: 50 }, style: 'black', startSec: 1, endSec: 2 }
    ]);
    expect(g.graph).toContain('gblur');
    expect(g.graph).toContain('drawbox');
    expect(g.graph).toContain('[v1]');
    expect(g.graph).toContain("enable='between(t,1.000,2.000)'");
    expect(g.out).toBe('v1');
  });

  it('concatListFile escapes quotes and flips backslashes', () => {
    expect(concatListFile(["C:\\a b\\it's.mp4"])).toBe("file 'C:/a b/it'\\''s.mp4'\n");
  });

  it('canConcatCopy requires identical stream layouts', () => {
    expect(canConcatCopy([facts(), facts()])).toBe(true);
    expect(canConcatCopy([facts(), facts({ width: 1280 })])).toBe(false);
    expect(canConcatCopy([facts(), facts({ hasAudio: false })])).toBe(false);
  });
});
