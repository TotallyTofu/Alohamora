import { withDefaults, type VideoTrimOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { trimArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, toolQuality, videoFacts } from './common';

export const runVideoTrim: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoTrimOptions>('video.trim', options);
  const f = await videoFacts(file);
  const end = o.endSec > 0 ? Math.min(o.endSec, f.durationSec) : f.durationSec;
  if (end - o.startSec < 0.1) throw new UserError('The selection is too short.');
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'trimmed' });
  await runFfmpeg(trimArgs(file.path, out, f, o.startSec, end, o.precise, fmt, toolQuality(ctx)),
    { durationSec: end - o.startSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};
