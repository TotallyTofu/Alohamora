import fs from 'node:fs';
import { formatBytes, formatDuration } from '@shared/time';
import { withDefaults, type VideoCompressOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { compressPlan, targetVideoKbps } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { runWithHwFallback, videoFacts } from './common';

export const runVideoCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoCompressOptions>('video.compress', options);
  const f = await videoFacts(file);
  const outFmt = file.fmt === 'webm' ? 'webm' : 'mp4';
  if (o.targetSizeMb > 0 && targetVideoKbps(o.targetSizeMb, f.durationSec, 128) < 150) {
    const minMb = Math.ceil(((150 + 128) * f.durationSec) / 8192);
    throw new UserError(`${o.targetSizeMb} MB is too small for a ${formatDuration(f.durationSec)} video. Try at least ${minMb} MB.`);
  }
  const out = ctx.newOutput({ source: file.path, ext: outFmt, suffix: 'compressed' });
  const passLog = ctx.tempPath('pass');
  const passes = compressPlan(file.path, out, f, o, outFmt, passLog);
  if (passes.length === 1) {
    await runWithHwFallback(ctx, (hw) => compressPlan(file.path, out, f, o, outFmt, passLog, hw)[0],
      { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  } else {
    for (let i = 0; i < passes.length; i++) {
      await runFfmpeg(passes[i], { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress((i + p) / passes.length) });
    }
  }
  const before = file.size;
  const after = (await fs.promises.stat(out)).size;
  if (after >= before && o.targetSizeMb === 0) {
    ctx.dropOutput(out);
    ctx.note('Already well compressed — no smaller file was made.');
    return;
  }
  ctx.note(`${formatBytes(before)} → ${formatBytes(after)} (−${Math.max(0, Math.round((1 - after / before) * 100))}%)`);
};
