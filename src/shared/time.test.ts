import { describe, expect, it } from 'vitest';
import { clamp, formatBytes, formatDuration, formatSrtTime, formatTimecode, formatVttTime, parseTimecode } from './time';

describe('time', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('parseTimecode', () => {
    expect(parseTimecode('1:02:03.5')).toBe(3723.5);
    expect(parseTimecode('00:00:01,500')).toBe(1.5);
    expect(parseTimecode('02:03')).toBe(123);
    expect(parseTimecode('75')).toBe(75);
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('')).toBeNull();
  });

  it('formatTimecode / formatDuration', () => {
    expect(formatTimecode(5.41)).toBe('0:05.41');
    expect(formatTimecode(3725.5)).toBe('1:02:05.50');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('SRT / VTT time', () => {
    expect(formatSrtTime(3723.5)).toBe('01:02:03,500');
    expect(formatVttTime(3723.5)).toBe('01:02:03.500');
    expect(formatSrtTime(-4)).toBe('00:00:00,000');
  });

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });
});
