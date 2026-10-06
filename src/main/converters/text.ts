import fs from 'node:fs';
import { toSrt, toVtt, textToCues } from '@shared/subtitles';
import { decodeText } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import type { JobContext } from '../jobs/context';

export async function readText(file: FileInfo): Promise<string> {
  return decodeText(await fs.promises.readFile(file.path));
}

export async function convertText(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const text = await readText(file);
  if (target === 'srt' || target === 'vtt') {
    const cues = textToCues(text, { timing: opts.cueTiming ?? 'reading', secondsPerCue: opts.secondsPerCue ?? 3 });
    if (cues.length === 0) throw new UserError('This text file is empty.');
    const out = ctx.newOutput({ source: file.path, ext: target });
    await fs.promises.writeFile(out, target === 'srt' ? '\uFEFF' + toSrt(cues) : toVtt(cues), 'utf8');
    return;
  }
  throw new UserError(`Converting text to ${target.toUpperCase()} is not available yet.`);
}
