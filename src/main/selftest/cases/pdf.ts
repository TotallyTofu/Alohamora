import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  check, expectCount, expectImage, expectMagic, expectPdfPages, expectTextIncludes, expectZipEntries
} from '../assert';
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
  },
  {
    name: 'convert.pdf.doc-docx', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'docx' }),
    check: async (o) => {
      expectCount(o, 1);
      const zip = await expectZipEntries(o[0], ['word/document.xml']);
      const xml = await zip.file('word/document.xml')!.async('string');
      check(xml.includes('Kabooks Test Document'), 'DOCX should contain the title text');
      check(xml.includes('Heading1'), 'DOCX should use the Heading1 style');
    }
  },
  {
    name: 'convert.pdf.doc-docx-pages', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'docx', options: { docMode: 'pages' } }),
    check: async (o) => {
      expectCount(o, 1);
      const zip = await expectZipEntries(o[0], ['word/document.xml']);
      const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !zip.files[n].dir);
      check(media.length === 3, `expected 3 page images, got ${media.length}`);
    }
  },
  {
    name: 'convert.pdf.doc-epub', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'epub' }),
    check: async (o) => {
      expectCount(o, 1);
      expectMagic(o[0], 30, 'mimetype');
      await expectZipEntries(o[0], ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml']);
    }
  },
  {
    name: 'convert.pdf.doc-epub-pages', group: 'pdf', fixtures: ['doc.pdf'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'epub', options: { docMode: 'pages' } }),
    check: async (o) => {
      expectCount(o, 1);
      const zip = await expectZipEntries(o[0], ['OEBPS/content.opf']);
      check((await zip.file('OEBPS/content.opf')!.async('string')).includes('pre-paginated'), 'OPF should declare pre-paginated layout');
      const jpgs = Object.keys(zip.files).filter((n) => n.endsWith('.jpg'));
      check(jpgs.length === 3, `expected 3 page images, got ${jpgs.length}`);
    }
  },
  {
    name: 'convert.pdf.scan-txt-ocr', group: 'pdf', fixtures: ['scan.pdf'],
    skip: (c) => (c.ocrLanguages.includes('eng') ? false : 'no English OCR data'),
    request: (i) => ({ kind: 'convert', inputs: i, target: 'txt' }),
    check: async (o) => {
      expectCount(o, 1);
      const text = fs.readFileSync(o[0], 'utf8').toUpperCase();
      check(text.includes('KABOOKS'), `OCR text should contain KABOOKS, got: ${text.slice(0, 80)}`);
      check(text.includes('OCR'), 'OCR text should contain OCR');
    }
  },
  {
    name: 'convert.epub.book-pdf', group: 'pdf', fixtures: ['book.epub'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'pdf' }),
    check: async (o) => {
      expectCount(o, 1);
      const n = await expectPdfPages(o[0], 'any');
      check(n >= 2, `expected at least 2 pages, got ${n}`);
    }
  },
  {
    name: 'convert.epub.fixed-pdf', group: 'pdf', fixtures: ['fixed.epub'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'pdf' }),
    check: async (o) => {
      expectCount(o, 1);
      await expectPdfPages(o[0], 2);
      const doc = await PDFDocument.load(fs.readFileSync(o[0]));
      const { width, height } = doc.getPage(0).getSize();
      check(width > height, `fixed-layout page should keep its landscape shape, got ${width}x${height}`);
    }
  }
];
