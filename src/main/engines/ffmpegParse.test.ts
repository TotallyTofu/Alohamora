import { describe, expect, it } from 'vitest';
import { friendlyFfmpegError, parseEncoderList, parseProbeJson, parseRate } from './ffmpegParse';

describe('parseEncoderList', () => {
  it('reads encoder names after the ------ separator', () => {
    const text = [
      'Encoders:',
      ' V..... = Video',
      ' ------',
      ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)',
      ' A....D aac                  AAC (Advanced Audio Coding)',
      ''
    ].join('\n');
    expect(parseEncoderList(text)).toEqual(['libx264', 'aac']);
  });

  it('handles CRLF output', () => {
    expect(parseEncoderList('Encoders:\r\n ------\r\n A....D flac FLAC\r\n')).toEqual(['flac']);
  });
});

describe('parseRate', () => {
  it('parses fractions and guards against zero', () => {
    expect(parseRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseRate('25/1')).toBe(25);
    expect(parseRate('0/0')).toBe(0);
    expect(parseRate(undefined)).toBe(0);
    expect(parseRate('abc')).toBe(0);
  });
});

describe('parseProbeJson', () => {
  it('swaps display size for rotated video', () => {
    const json = JSON.stringify({
      streams: [{
        codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30/1',
        side_data_list: [{ rotation: -90 }]
      }, { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, bit_rate: '128000' }],
      format: { duration: '12.5', format_name: 'mov,mp4', bit_rate: '2000000', tags: { Title: 'Clip' } }
    });
    const p = parseProbeJson(json);
    expect(p.video?.displayWidth).toBe(1080);
    expect(p.video?.displayHeight).toBe(1920);
    expect(p.video?.rotation).toBe(-90);
    expect(p.video?.fps).toBe(30);
    expect(p.audio).toEqual({ codec: 'aac', sampleRate: 48000, channels: 2, bitRate: 128000 });
    expect(p.durationSec).toBe(12.5);
    expect(p.tags.title).toBe('Clip');
  });

  it('treats an attached_pic stream as cover art, not video', () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 2 },
        { codec_type: 'video', codec_name: 'mjpeg', width: 600, height: 600, disposition: { attached_pic: 1 } }
      ],
      format: { duration: '200', format_name: 'mp3' }
    });
    const p = parseProbeJson(json);
    expect(p.hasCover).toBe(true);
    expect(p.video).toBeNull();
    expect(p.audio?.codec).toBe('mp3');
  });

  it('falls back to stream durations and tolerates missing parts', () => {
    const p = parseProbeJson(JSON.stringify({ streams: [{ codec_type: 'audio', duration: '3.2' }] }));
    expect(p.durationSec).toBe(3.2);
    expect(p.video).toBeNull();
  });
});

describe('friendlyFfmpegError', () => {
  it('maps common stderr text', () => {
    expect(friendlyFfmpegError('moov atom not found')).toContain('damaged');
    expect(friendlyFfmpegError('Permission denied')).toContain("can't read or write");
    expect(friendlyFfmpegError('No space left on device')).toBe('The disk is full.');
    expect(friendlyFfmpegError('something odd')).toBe('FFmpeg could not process this file.');
  });
});
