import { clampNormRect, toPixelRect } from '@shared/geometry';
import { withDefaults, type VideoRedactOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { redactArgs, type PixelRegion } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, toolQuality, videoFacts, runWithHwFallback } from './common';

export const runVideoRedact: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoRedactOptions>('video.redact', options);
  if (o.regions.length === 0) throw new UserError('Draw at least one box over the area to hide.');
  const f = await videoFacts(file);
  const regions: PixelRegion[] = o.regions.map((r) => ({
    rect: toPixelRect(clampNormRect(r.rect), f.width ?? 0, f.height ?? 0, true), style: r.style, startSec: r.startSec, endSec: r.endSec
  }));
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'redacted' });
  await runWithHwFallback(ctx, (hw) => redactArgs(file.path, out, f, regions, fmt, toolQuality(ctx), hw), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  ctx.note('Metadata removed');
};
