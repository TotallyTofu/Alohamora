import { withDefaults, type VideoSpeedOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { speedArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, toolQuality, videoFacts, runWithHwFallback } from './common';

export const runVideoSpeed: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSpeedOptions>('video.speed', options);
  if (!(o.factor >= 0.25 && o.factor <= 4)) throw new UserError('Speed must be between 0.25× and 4×.');
  const f = await videoFacts(file);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: `${o.factor}x` });
  await runWithHwFallback(ctx, (hw) => speedArgs(file.path, out, f, o.factor, o.keepAudio, fmt, toolQuality(ctx), hw),
    { durationSec: f.durationSec / o.factor, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};
