// Runs the golden cases in src/shared/golden/*.json against the TypeScript originals.
// src-tauri/crates/core/tests/golden.rs runs the same cases against the Rust ports, so the UI's previews
// (split points, page ranges, file names…) and what the backend really does cannot drift apart.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collageCells } from './collageLayout';
import { buildEditSpec } from './editPipeline';
import { clampNormRect, isFullRect, toPixelRect } from './geometry';
import { groupFileName, groupFolderName, outputFileName, sanitizeFileName, splitName, withCounter } from './naming';
import { flattenRanges, parsePageRanges } from './pageRanges';
import { blocksToText, blocksToXhtml, isScanned, reflowPages, splitChapters, textToBlocks } from './pdfReflow';
import { splitGroups } from './pdfSplit';
import { splitSegments } from './split';
import { parseSubtitles, shiftCues, stripTags, textToCues, toPlainText, toSrt, toVtt } from './subtitles';
import { decodeText, escapeXml, guessLang } from './text';
import { formatBytes, formatDuration, formatSrtTime, formatTimecode, formatVttTime, parseTimecode } from './time';
import { withDefaults } from './toolOptions';
import collageLayout from './golden/collageLayout.json';
import editPipeline from './golden/editPipeline.json';
import geometry from './golden/geometry.json';
import naming from './golden/naming.json';
import pageRanges from './golden/pageRanges.json';
import pdfReflow from './golden/pdfReflow.json';
import split from './golden/split.json';
import subtitles from './golden/subtitles.json';
import text from './golden/text.json';
import time from './golden/time.json';

interface Case { args: unknown[]; out?: unknown; err?: string }
type GoldenFile = Record<string, Case[] | string>;
type Fn = (...args: unknown[]) => unknown;

const FILES: Record<string, GoldenFile> = {
  'collageLayout.json': collageLayout, 'editPipeline.json': editPipeline, 'geometry.json': geometry, 'naming.json': naming,
  'pageRanges.json': pageRanges, 'pdfReflow.json': pdfReflow, 'split.json': split, 'subtitles.json': subtitles,
  'text.json': text, 'time.json': time
} as unknown as Record<string, GoldenFile>;

const FNS = {
  parseTimecode, formatTimecode, formatSrtTime, formatVttTime, formatDuration, formatBytes,
  splitName, outputFileName, groupFolderName, groupFileName, withCounter, sanitizeFileName,
  parsePageRanges, flattenRanges, splitGroups, splitSegments,
  clampNormRect, toPixelRect, isFullRect,
  decodeText: (bytes: number[]) => decodeText(Uint8Array.from(bytes)), escapeXml, guessLang,
  parseSubtitles, stripTags, toSrt, toVtt, toPlainText, shiftCues, textToCues,
  collageCells,
  buildEditSpec: (p: Record<string, unknown>) => buildEditSpec(withDefaults('image.edit', p)),
  reflowPages, isScanned, textToBlocks, blocksToText, blocksToXhtml, splitChapters
} as unknown as Record<string, Fn>;

/** Floats are compared to 9 decimal places (both languages do the same IEEE arithmetic, but 0.1 + 0.2 style noise is not the point). */
function norm(v: unknown): unknown {
  if (typeof v === 'number') return Math.round(v * 1e9) / 1e9 + 0;
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  return v;
}

it('every golden file is listed here (and in crates/core/tests/golden.rs)', () => {
  const dir = fileURLToPath(new URL('./golden/', import.meta.url));
  expect(readdirSync(dir).filter((f) => f.endsWith('.json')).sort()).toEqual(Object.keys(FILES).sort());
});

for (const [file, groups] of Object.entries(FILES)) {
  describe(file, () => {
    for (const [name, cases] of Object.entries(groups)) {
      if (name.startsWith('_')) continue;
      it(name, () => {
        const fn = FNS[name];
        expect(fn, `no runner for ${name}`).toBeTypeOf('function');
        (cases as Case[]).forEach((c, i) => {
          const label = `${name} case ${i + 1}: ${JSON.stringify(c.args).slice(0, 120)}`;
          if (c.err !== undefined) {
            expect(() => fn(...c.args), label).toThrow();
            try { fn(...c.args); } catch (e) { expect((e as Error).message, label).toBe(c.err); }
          } else {
            expect(norm(fn(...c.args)), label).toEqual(norm(c.out));
          }
        });
      });
    }
  });
}
