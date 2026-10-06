import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { ToolId } from '@shared/types';
import { check, expectCount, expectPdfPages, expectTextIncludes, expectZipEntries } from '../assert';
import type { SelfTestCase } from '../types';

function toolCase(
  name: string, fixtures: string[], toolId: ToolId, options: Record<string, unknown>, verify: (o: string[]) => Promise<void>,
  skip?: SelfTestCase['skip']
): SelfTestCase {
  return {
    name: `tools.pdf.${name}`, group: 'tools.pdf', fixtures, skip,
    request: (inputs) => ({ kind: 'tool', inputs, toolId, options }),
    check: verify
  };
}

const NO_OCR: SelfTestCase['skip'] = (c) => (c.ocrLanguages.includes('eng') ? false : 'no English OCR data');
const load = async (f: string): Promise<PDFDocument> => PDFDocument.load(fs.readFileSync(f));

export const PDF_TOOL_CASES: SelfTestCase[] = [
  toolCase('merge', ['doc.pdf', 'doc-copy.pdf'], 'pdf.merge', {}, async (o) => { expectCount(o, 1); await expectPdfPages(o[0], 6); }),
  toolCase('split-each', ['doc.pdf'], 'pdf.split', { mode: 'each' }, async (o) => {
    expectCount(o, 3);
    for (const f of o) await expectPdfPages(f, 1);
  }),
  toolCase('split-ranges', ['doc.pdf'], 'pdf.split', { mode: 'ranges', ranges: '1-2,3' }, async (o) => { expectCount(o, 2); }),
  toolCase('split-extract', ['doc.pdf'], 'pdf.split', { mode: 'extract', ranges: '2' }, async (o) => { expectCount(o, 1); await expectPdfPages(o[0], 1); }),
  {
    name: 'tools.pdf.split-bad-range-fails', group: 'tools.pdf', fixtures: ['doc.pdf'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'pdf.split', options: { mode: 'extract', ranges: '9' } }),
    expectError: /doesn't exist/
  },
  toolCase('organize', ['doc.pdf'], 'pdf.organize', { pages: [{ src: 2, rotate: 90 }, { src: 0, rotate: 0 }] }, async (o) => {
    expectCount(o, 1);
    await expectPdfPages(o[0], 2);
    check((await load(o[0])).getPage(0).getRotation().angle === 90, 'first page should be rotated 90°');
  }),
  toolCase('images', ['doc.pdf'], 'pdf.images', { format: 'png', dpi: 72, ranges: '1' }, async (o) => {
    expectCount(o, 1);
    check((await sharp(o[0]).metadata()).width === 612, 'a US-letter page at 72 DPI is 612 px wide');
  }),
  toolCase('compress-balanced', ['doc.pdf'], 'pdf.compress', { level: 'balanced' }, async (o) => {
    check(o.length <= 1, `expected 0 or 1 outputs, got ${o.length}`);
    if (o.length === 1) await expectPdfPages(o[0], 3);
  }),
  toolCase('compress-max', ['doc.pdf'], 'pdf.compress', { level: 'max' }, async (o) => { expectCount(o, 1); await expectPdfPages(o[0], 3); }),
  toolCase('ocr-txt', ['scan.pdf'], 'pdf.ocr', { languages: ['eng'], output: 'txt' }, async (o) => {
    expectCount(o, 1);
    check(fs.readFileSync(o[0], 'utf8').toUpperCase().includes('KABOOKS'), 'OCR text should contain KABOOKS');
  }, NO_OCR),
  toolCase('ocr-pdf', ['scan.pdf'], 'pdf.ocr', { languages: ['eng'], output: 'pdf' }, async (o) => { expectCount(o, 1); await expectPdfPages(o[0], 1); }, NO_OCR),
  toolCase('word', ['doc.pdf'], 'pdf.word', {}, async (o) => { expectCount(o, 1); await expectZipEntries(o[0], ['word/document.xml']); }),
  toolCase('metadata-title', ['doc.pdf'], 'pdf.metadata', { title: 'New Title', author: 'Me', keywords: 'a, b' }, async (o) => {
    expectCount(o, 1);
    const d = await load(o[0]);
    check(d.getTitle() === 'New Title', `title should be New Title, got ${d.getTitle()}`);
    check(d.getAuthor() === 'Me', 'author should be Me');
  }),
  toolCase('metadata-remove-all', ['doc.pdf'], 'pdf.metadata', { removeAll: true }, async (o) => {
    expectCount(o, 1);
    check((await load(o[0])).getTitle() === undefined, 'title should be gone');
    await expectPdfPages(o[0], 3);
  })
];

export const SUBTITLE_TOOL_CASES: SelfTestCase[] = [
  {
    name: 'tools.subtitle.shift', group: 'tools.subtitle', fixtures: ['subs.srt'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'subtitle.shift', options: { offsetMs: 1000 } }),
    check: async (o) => {
      expectCount(o, 1);
      expectTextIncludes(o[0], '00:00:02,000 --> 00:00:03,500');
    }
  }
];
