import fs from 'node:fs';
import { parseSubtitles, toPlainText, toSrt, toVtt } from '@shared/subtitles';
import { decodeText } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import type { JobContext } from '../jobs/context';

export async function convertSubtitle(file: FileInfo, target: Fmt, _opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const cues = parseSubtitles(decodeText(await fs.promises.readFile(file.path)));
  if (cues.length === 0) throw new UserError(`No subtitles were found in ${file.name}.`);
  const out = ctx.newOutput({ source: file.path, ext: target });
  const text = target === 'srt' ? '\uFEFF' + toSrt(cues) : target === 'vtt' ? toVtt(cues) : toPlainText(cues);
  await fs.promises.writeFile(out, text, 'utf8');
}
