import { splitSegments } from '@shared/split';
import { withDefaults, type VideoSplitOptions } from '@shared/toolOptions';
import { throwIfAborted, UserError } from '../../errors';
import { trimArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, toolQuality, videoFacts, runWithHwFallback } from './common';

export const runVideoSplit: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSplitOptions>('video.split', options);
  const f = await videoFacts(file);
  const segs = splitSegments(f.durationSec, o);
  if (segs.length < 2) throw new UserError('Add at least one cut point inside the video.');
  const fmt = sameFmt(file);
  for (let i = 0; i < segs.length; i++) {
    throwIfAborted(ctx.signal);
    const out = ctx.newOutput({ source: file.path, ext: fmt, group: 'parts', index: i + 1, total: segs.length });
    await runWithHwFallback(ctx, (hw) => trimArgs(file.path, out, f, segs[i].start, segs[i].end, o.precise, fmt, toolQuality(ctx), hw),
      { durationSec: segs[i].end - segs[i].start, signal: ctx.signal, onProgress: (p) => ctx.progress((i + p) / segs.length) });
  }
  ctx.note(`${segs.length} parts`);
};
