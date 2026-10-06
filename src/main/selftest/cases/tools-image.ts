import exifr from 'exifr';
import fs from 'node:fs';
import sharp from 'sharp';
import type { ToolId } from '@shared/types';
import { check, expectCount, expectImage, expectPdfPages } from '../assert';
import type { SelfTestCase } from '../types';

function toolCase(
  name: string, fixtures: string[], toolId: ToolId, options: Record<string, unknown>, verify: (o: string[]) => Promise<void>
): SelfTestCase {
  return {
    name: `tools.image.${name}`, group: 'tools.image', fixtures,
    request: (inputs) => ({ kind: 'tool', inputs, toolId, options }),
    check: verify
  };
}

async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(file).ensureAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return Array.from(data);
}

let sourceBytes = 0;

export const IMAGE_TOOL_CASES: SelfTestCase[] = [
  {
    name: 'tools.image.compress-jpg', group: 'tools.image', fixtures: ['photo.jpg'],
    request: (inputs) => {
      sourceBytes = fs.statSync(inputs[0]).size;
      return { kind: 'tool', inputs, toolId: 'image.compress', options: { quality: 40 } };
    },
    check: async (o) => {
      expectCount(o, 1);
      await expectImage(o[0], 'jpeg');
      check(fs.statSync(o[0]).size < sourceBytes, `compressed (${fs.statSync(o[0]).size}) should be smaller than the source (${sourceBytes})`);
    }
  },
  toolCase('compress-png', ['image.png'], 'image.compress', {}, async (o) => {
    // either a PNG was written, or the output was dropped because it was not smaller; both are fine, an error is not
    check(o.length === 0 || o.length === 1, `expected 0 or 1 outputs, got ${o.length}`);
    if (o.length === 1) await expectImage(o[0], 'png');
  }),
  toolCase('resize-50', ['image.png'], 'image.resize', { mode: 'percent', percent: 50 }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'png', { width: 400, height: 300 });
  }),
  toolCase('crop-rect', ['image.png'], 'image.crop', { rect: { x: 0, y: 0, w: 0.5, h: 0.5 } }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'png', { width: 400, height: 300 });
  }),
  toolCase('crop-rotate', ['image.png'], 'image.crop', { rotate: 90 }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'png', { width: 600, height: 800 });
  }),
  toolCase('edit-bw-keeps-alpha', ['image.png'], 'image.edit', { exposure: 0.5, effect: 'bw' }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'png');
    check((await pixel(o[0], 0, 0))[3] === 0, 'transparent corner should stay transparent');
  }),
  toolCase('edit-sepia-jpg', ['photo.jpg'], 'image.edit', { effect: 'sepia' }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'jpeg');
  }),
  toolCase('background', ['image.png'], 'image.background', {}, async (o) => {
    expectCount(o, 1);
    const m = await sharp(o[0]).metadata();
    check(m.format === 'png' && (m.width ?? 0) > 800 && (m.height ?? 0) > 600, `backdrop should be larger than 800x600, got ${m.width}x${m.height}`);
  }),
  toolCase('redact-black', ['photo.jpg'], 'image.redact', { regions: [{ rect: { x: 0, y: 0, w: 0.25, h: 0.25 }, style: 'black' }] }, async (o) => {
    expectCount(o, 1);
    const [r, g, b] = await pixel(o[0], 5, 5);
    check(r + g + b < 30, `pixel (5,5) should be near black, got ${r},${g},${b}`);
  }),
  {
    name: 'tools.image.redact-empty-fails', group: 'tools.image', fixtures: ['photo.jpg'],
    request: (inputs) => ({ kind: 'tool', inputs, toolId: 'image.redact', options: {} }),
    expectError: /at least one box/i
  },
  toolCase('metadata-remove-all', ['gps.jpg'], 'image.metadata', { action: 'remove-all' }, async (o) => {
    expectCount(o, 1);
    const d = (await exifr.parse(o[0], { gps: true, tiff: true }).catch(() => null)) as Record<string, unknown> | null;
    check(!d?.Artist, 'Artist should be gone');
    check(d?.latitude === undefined, 'GPS should be gone');
  }),
  toolCase('metadata-remove-gps', ['gps.jpg'], 'image.metadata', { action: 'remove-gps' }, async (o) => {
    expectCount(o, 1);
    const d = (await exifr.parse(o[0], { gps: true, tiff: true })) as Record<string, unknown>;
    check(d.Artist === 'Tester', `Artist should survive, got ${String(d.Artist)}`);
    check(d.latitude === undefined, 'GPS should be gone');
  }),
  toolCase('metadata-edit', ['gps.jpg'], 'image.metadata', { action: 'edit', fields: { artist: 'New' } }, async (o) => {
    expectCount(o, 1);
    const d = (await exifr.parse(o[0], { gps: true, tiff: true })) as Record<string, unknown>;
    check(d.Artist === 'New', `Artist should be New, got ${String(d.Artist)}`);
  }),
  toolCase('metadata-remove-all-png', ['image.png'], 'image.metadata', { action: 'remove-all' }, async (o) => {
    expectCount(o, 1);
    await expectImage(o[0], 'png', { width: 800, height: 600 });
  }),
  toolCase('collage-grid', ['image.png', 'photo.jpg', 'image.webp'], 'image.collage', { layout: 'grid' }, async (o) => {
    expectCount(o, 1);
    const m = await sharp(o[0]).metadata();
    check(m.format === 'jpeg' && m.width === 2048, `expected a 2048 px wide JPEG, got ${m.format} ${m.width}`);
  }),
  toolCase('make-pdf', ['image.png', 'photo.jpg'], 'image.pdf', { pageSize: 'a4', combine: true }, async (o) => {
    expectCount(o, 1);
    await expectPdfPages(o[0], 2);
  })
];
