import { withDefaults, type MediaMetadataOptions } from '@shared/toolOptions';
import { CanceledError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { metadataArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, videoFacts } from './common';

/** Some containers reject data streams with `-map 0`; fall back to video, audio and subtitle streams only. */
function narrowMaps(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-map' && args[i + 1] === '0') { out.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?'); i++; } else out.push(args[i]);
  }
  return out;
}

export const runVideoMetadata: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<MediaMetadataOptions>('video.metadata', options);
  const f = await videoFacts(file);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: o.removeAll ? 'clean' : 'meta' });
  const args = metadataArgs(file.path, out, { removeAll: o.removeAll, tags: o.tags }, fmt);
  const run = (a: string[]): Promise<void> =>
    runFfmpeg(a, { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  try {
    await run(args);
  } catch (e) {
    if (e instanceof CanceledError) throw e;
    await run(narrowMaps(args));
  }
  ctx.note(o.removeAll ? 'Metadata removed' : 'Metadata updated');
};
