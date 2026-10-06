import fs from 'node:fs';
import { parseSubtitles } from '@shared/subtitles';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { check, expectCount, expectTextIncludes } from '../assert';
import type { SelfTestCase } from '../types';

function textCase(
  name: string, fixture: string, target: Fmt, verify: (file: string) => void | Promise<void>, options?: ConvertOptions
): SelfTestCase {
  return {
    name, group: 'text', fixtures: [fixture],
    request: (i) => ({ kind: 'convert', inputs: i, target, options }),
    check: async (o) => { expectCount(o, 1); await verify(o[0]); }
  };
}

/** Read a text output with BOM removed and CRLF normalised. */
const read = (file: string): string => fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

export const TEXT_CASES: SelfTestCase[] = [
  textCase('convert.sub.srt-vtt', 'subs.srt', 'vtt', (f) => {
    const t = read(f);
    check(t.startsWith('WEBVTT'), 'VTT must start with WEBVTT');
    check(t.includes('00:00:01.000 --> 00:00:02.500'), 'VTT should use dot timestamps');
  }),
  textCase('convert.sub.srt-txt', 'subs.srt', 'txt', (f) => {
    const t = read(f);
    check(t.includes('Hello world'), 'TXT should contain the cue text');
    check(!t.includes('<i>'), 'TXT should not contain tags');
  }),
  textCase('convert.sub.vtt-srt', 'subs.vtt', 'srt', (f) => {
    check(read(f).includes('1\n00:00:01,000 --> 00:00:02,500'), 'SRT should number cues and use comma timestamps');
  }),
  textCase('convert.text.txt-srt', 'text.txt', 'srt', (f) => {
    const n = parseSubtitles(read(f)).length;
    check(n >= 4, `expected at least 4 cues, got ${n}`);
  }),
  textCase('convert.text.txt-vtt', 'text.txt', 'vtt', (f) => { expectTextIncludes(f, 'WEBVTT'); })
];
