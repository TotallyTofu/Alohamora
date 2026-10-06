import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { muteArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, videoFacts } from './common';

export const runVideoMute: ToolRunFn = async ([file], _options, ctx) => {
  const f = await videoFacts(file);
  if (!f.hasAudio) throw new UserError(`${file.name} has no audio to remove.`);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'muted' });
  await runFfmpeg(muteArgs(file.path, out, fmt), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};
