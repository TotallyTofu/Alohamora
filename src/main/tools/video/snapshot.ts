import fs from 'node:fs';
import path from 'node:path';
import { withDefaults, type VideoSnapshotOptions } from '@shared/toolOptions';
import { runFfmpeg } from '../../engines/ffmpeg';
import { framesEveryArgs, snapshotArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { videoFacts } from './common';

export const runVideoSnapshot: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSnapshotOptions>('video.snapshot', options);
  const f = await videoFacts(file);
  if (o.mode === 'single') {
    const out = ctx.newOutput({ source: file.path, ext: o.format, suffix: `frame-${o.timeSec.toFixed(2).replace('.', '_')}s` });
    await runFfmpeg(snapshotArgs(file.path, out, Math.min(o.timeSec, Math.max(0, f.durationSec - 0.05)), o.format), { signal: ctx.signal });
    return;
  }
  const dir = ctx.tempPath('frames');
  await fs.promises.mkdir(dir, { recursive: true });
  await runFfmpeg(framesEveryArgs(file.path, path.join(dir, `f-%05d.${o.format}`), o.everySec, o.format),
    { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  const names = (await fs.promises.readdir(dir)).sort();
  for (let i = 0; i < names.length; i++) {
    const out = ctx.newOutput({ source: file.path, ext: o.format, group: 'frames', index: i + 1, total: names.length });
    await fs.promises.rename(path.join(dir, names[i]), out);
  }
  ctx.note(`${names.length} frames`);
};
