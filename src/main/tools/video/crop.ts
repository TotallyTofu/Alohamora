import { clampNormRect, isFullRect, toPixelRect } from '@shared/geometry';
import { withDefaults, type VideoCropOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { cropArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, toolQuality, videoFacts, runWithHwFallback } from './common';

export const runVideoCrop: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoCropOptions>('video.crop', options);
  const f = await videoFacts(file);
  if (isFullRect(o.rect)) throw new UserError('Move the crop handles first — the whole frame is selected.');
  const r = toPixelRect(clampNormRect(o.rect), f.width ?? 0, f.height ?? 0, true);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'cropped' });
  await runWithHwFallback(ctx, (hw) => cropArgs(file.path, out, f, r, fmt, toolQuality(ctx), hw), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  ctx.note(`${r.w} × ${r.h} px`);
};
