import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { check, expectCount, expectImage, expectTextIncludes } from '../assert';
import type { SelfTestCase } from '../types';

export const PDF_CASES: SelfTestCase[] = [
  {
    name: 'convert.pdf.doc-png', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'png' }),
    check: async (o) => {
      expectCount(o, 3);
      const m = await sharp(o[0]).metadata();
      check(Math.abs((m.width ?? 0) - 2550) <= 2, `612 pt at 300 DPI should be 2550 px wide, got ${m.width}`);
      check(path.basename(path.dirname(o[0])).endsWith('-pages'), 'page images should be written into a "-pages" folder');
      check(new Set(o.map((f) => path.dirname(f))).size === 1, 'all pages should be in one folder');
    }
  },
  {
    name: 'convert.pdf.doc-jpg', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'jpg' }),
    check: async (o) => { expectCount(o, 3); for (const f of o) await expectImage(f, 'jpeg'); }
  },
  {
    name: 'convert.pdf.doc-txt', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'txt' }),
    check: async (o) => {
      expectCount(o, 1);
      expectTextIncludes(o[0], 'Kabooks Test Document');
      expectTextIncludes(o[0], 'First item');
      const lines = fs.readFileSync(o[0], 'utf8').split('\n').map((l) => l.trim());
      check(!lines.includes('2'), 'page number "2" should have been removed');
    }
  }
];
