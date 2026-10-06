import fs from 'node:fs';
import { parseSubtitles, shiftCues, toSrt, toVtt } from '@shared/subtitles';
import { decodeText } from '@shared/text';
import { withDefaults, type SubtitleShiftOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import type { ToolRunFn } from '../index';

export const runSubtitleShift: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<SubtitleShiftOptions>('subtitle.shift', options);
  const cues = parseSubtitles(decodeText(await fs.promises.readFile(file.path)));
  if (cues.length === 0) throw new UserError(`No subtitles were found in ${file.name}.`);
  const shifted = shiftCues(cues, o.offsetMs / 1000);
  const ext = file.fmt === 'vtt' ? 'vtt' : 'srt';
  const text = ext === 'srt' ? '\uFEFF' + toSrt(shifted) : toVtt(shifted);
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext, suffix: 'shifted' }), text, 'utf8');
  ctx.note(`${shifted.length} subtitles shifted by ${o.offsetMs} ms`);
};
