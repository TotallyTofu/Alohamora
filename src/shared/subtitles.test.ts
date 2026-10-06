import { describe, expect, it } from 'vitest';
import { parseSubtitles, shiftCues, stripTags, textToCues, toPlainText, toSrt, toVtt } from './subtitles';

const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>world</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond\r\nline\r\n';

const VTT = `WEBVTT

NOTE this is a comment
spanning two lines

00:01.000 --> 00:02.500 align:start position:0%
First cue without an id

intro
00:00:03.000 --> 00:00:04.000
Second cue
`;

describe('parseSubtitles', () => {
  it('parses SRT with BOM and CRLF', () => {
    const cues = parseSubtitles(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: 'Hello <i>world</i>' });
    expect(cues[1].text).toBe('Second\nline');
    expect(cues[1].start).toBe(4);
  });

  it('parses VTT with header, NOTE, short times, settings and ids', () => {
    const cues = parseSubtitles(VTT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 2.5, text: 'First cue without an id' });
    expect(cues[1]).toEqual({ start: 3, end: 4, text: 'Second cue' });
  });

  it('round-trips VTT → SRT', () => {
    const cues = parseSubtitles(SRT);
    expect(toSrt(parseSubtitles(toVtt(cues)))).toBe(toSrt(cues));
  });
});

describe('stripTags', () => {
  it('removes tags and decodes entities', () => {
    expect(stripTags('<v Bob><i>Hi</i> &amp; bye</v>', false)).toBe('Hi & bye');
  });

  it('keeps basic formatting for SRT', () => {
    expect(stripTags('<v Bob><i>Hi</i> &amp; bye</v>', true)).toBe('<i>Hi</i> &amp; bye');
  });
});

describe('output writers', () => {
  const cues = [{ start: 0.5, end: 2, text: 'A <b>b</b> &amp; c' }];

  it('toSrt numbers cues and uses commas', () => {
    expect(toSrt(cues)).toBe('1\n00:00:00,500 --> 00:00:02,000\nA <b>b</b> &amp; c\n');
  });

  it('toVtt has a header and dots', () => {
    expect(toVtt(cues).startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:02.000\n')).toBe(true);
  });

  it('toPlainText strips tags', () => {
    expect(toPlainText(cues)).toBe('A b & c\n');
  });
});

describe('shiftCues', () => {
  it('shifts later and clamps starts at zero', () => {
    const out = shiftCues([{ start: 1, end: 2, text: 'a' }, { start: 0.2, end: 0.8, text: 'b' }], -0.5);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ start: 0.5, end: 1.5, text: 'a' });
    expect(out[1].start).toBe(0);
    expect(out[1].end).toBeCloseTo(0.3, 6);
  });

  it('drops cues that end before zero', () => {
    expect(shiftCues([{ start: 0, end: 1, text: 'gone' }], -5)).toEqual([]);
  });
});

describe('textToCues', () => {
  it('fixed timing: one cue per non-empty line with a gap', () => {
    const cues = textToCues('a\n\nb', { timing: 'fixed', secondsPerCue: 2 });
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBe(2);
    expect(cues[1].start).toBeCloseTo(2.1, 6);
    expect(cues[1].end).toBeCloseTo(4.1, 6);
  });

  it('reading timing stays between 1.2 s and 7 s', () => {
    const cues = textToCues('Hi\n' + 'word '.repeat(80).trim(), { timing: 'reading', secondsPerCue: 3 });
    for (const c of cues) {
      const d = c.end - c.start;
      expect(d).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(d).toBeLessThanOrEqual(7 + 1e-9);
    }
    expect(cues.length).toBeGreaterThan(2);
  });

  it('wraps long cues onto two lines', () => {
    const [cue] = textToCues('this is a rather long subtitle sentence that needs two lines', { timing: 'fixed', secondsPerCue: 2 });
    expect(cue.text.split('\n')).toHaveLength(2);
  });
});
