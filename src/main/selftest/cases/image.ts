import fs from 'node:fs';
import sharp from 'sharp';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { check, expectCount, expectImage, expectMagic, expectPdfPages, expectZipEntries } from '../assert';
import type { SelfTestCase } from '../types';

function convertCase(
  name: string, fixture: string, target: Fmt, verify: (o: string[]) => Promise<void>,
  extra: { options?: ConvertOptions; skip?: SelfTestCase['skip'] } = {}
): SelfTestCase {
  return {
    name, group: 'image', fixtures: [fixture], skip: extra.skip,
    request: (i) => ({ kind: 'convert', inputs: i, target, options: extra.options }),
    check: async (o) => { expectCount(o, 1); await verify(o); }
  };
}

const NO_HEIC: SelfTestCase['skip'] = (c) => (c.heifEnc ? false : 'no HEIC encoder on this OS');
const FULL = { width: 800, height: 600 };

export const IMAGE_CASES: SelfTestCase[] = [
  convertCase('convert.image.png-jpg', 'image.png', 'jpg', (o) => expectImage(o[0], 'jpeg', FULL)),
  convertCase('convert.image.png-webp', 'image.png', 'webp', (o) => expectImage(o[0], 'webp', FULL)),
  convertCase('convert.image.png-avif', 'image.png', 'avif', (o) => expectImage(o[0], 'heif')),
  convertCase('convert.image.png-tiff', 'image.png', 'tiff', (o) => expectImage(o[0], 'tiff')),
  convertCase('convert.image.png-bmp', 'image.png', 'bmp', async (o) => { expectMagic(o[0], 0, 'BM'); }),
  convertCase('convert.image.photo-orient', 'photo.jpg', 'png', async (o) => {
    await expectImage(o[0], 'png', { width: 600, height: 800 });
    const orientation = (await sharp(o[0]).metadata()).orientation;
    check(orientation === undefined || orientation === 1, `orientation tag should be gone, got ${orientation}`);
  }),
  convertCase('convert.image.svg-png', 'image.svg', 'png', async (o) => {
    await expectImage(o[0], 'png');
    const m = await sharp(o[0]).metadata();
    check((m.width ?? 0) > 800, `SVG should render sharply (width > 800), got ${m.width}`);
  }),
  convertCase('convert.image.bmp-png', 'image.bmp', 'png', (o) => expectImage(o[0], 'png', FULL)),
  convertCase('convert.image.tiff-webp', 'image.tiff', 'webp', (o) => expectImage(o[0], 'webp')),
  convertCase('convert.image.avif-jpg', 'image.avif', 'jpg', (o) => expectImage(o[0], 'jpeg')),
  convertCase('convert.image.png-svg-trace', 'image.png', 'svg', async (o) => {
    const t = fs.readFileSync(o[0], 'utf8');
    check(t.trimStart().startsWith('<svg') && t.includes('<path'), 'traced SVG should start with <svg and contain <path');
  }),
  convertCase('convert.image.png-svg-embed', 'image.png', 'svg', async (o) => {
    check(fs.readFileSync(o[0], 'utf8').includes('data:image/png;base64'), 'embedded SVG should contain the PNG data URL');
  }, { options: { svgMode: 'embed' } }),
  convertCase('convert.image.png-heic', 'image.png', 'heic', async (o) => { expectMagic(o[0], 4, 'ftyp'); }, { skip: NO_HEIC }),
  convertCase('convert.image.heic-jpg', 'image.heic', 'jpg', (o) => expectImage(o[0], 'jpeg', FULL), { skip: NO_HEIC }),
  convertCase('convert.image.png-pdf', 'image.png', 'pdf', async (o) => { await expectPdfPages(o[0], 1); }),
  convertCase('convert.image.photo-docx', 'photo.jpg', 'docx', async (o) => {
    const zip = await expectZipEntries(o[0], ['word/document.xml']);
    check(Object.keys(zip.files).some((n) => n.startsWith('word/media/')), 'DOCX should contain an image under word/media/');
  })
];
