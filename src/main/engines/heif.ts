import type { Sharp } from 'sharp';
import { getHeicTool } from '../capabilities';
import { UserError } from '../errors';
import { runProcess } from './process';

/** Write `img` as HEIC. macOS uses Apple's built-in sips; Windows/Linux use heif-enc (x265). */
export async function encodeHeic(img: Sharp, out: string, quality: number, scratchPng: string, signal: AbortSignal): Promise<void> {
  const tool = getHeicTool();
  if (!tool) throw new UserError('HEIC output is not available on this computer (see the Formats page).');
  await img.png().toFile(scratchPng);
  await encodeHeicFile(scratchPng, out, quality, signal);
}

export async function encodeHeicFile(inputPng: string, out: string, quality: number, signal?: AbortSignal): Promise<void> {
  const tool = getHeicTool();
  if (!tool) throw new UserError('HEIC output is not available on this computer.');
  const q = String(Math.max(1, Math.min(100, Math.round(quality))));
  const args = tool.kind === 'sips'
    ? ['-s', 'format', 'heic', '-s', 'formatOptions', q, inputPng, '--out', out]
    : ['-q', q, '-o', out, inputPng];
  await runProcess(tool.path, args, { signal, name: tool.kind });
}
