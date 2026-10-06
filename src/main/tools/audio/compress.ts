import fs from 'node:fs';
import { formatBytes } from '@shared/time';
import { withDefaults, type AudioCompressOptions } from '@shared/toolOptions';
import { runFfmpeg } from '../../engines/ffmpeg';
import { compressAudioArgs, compressOutFmt } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt } from './common';

export const runAudioCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioCompressOptions>('audio.compress', options);
  const f = await audioFacts(file);
  const outFmt = compressOutFmt(sameAudioFmt(file), o.format);
  const out = ctx.newOutput({ source: file.path, ext: outFmt, suffix: 'compressed' });
  await runFfmpeg(compressAudioArgs(file.path, out, o, outFmt), {
    durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
  const after = (await fs.promises.stat(out)).size;
  if (after >= file.size) {
    ctx.dropOutput(out);
    ctx.note('Already small — no smaller file was made');
    return;
  }
  ctx.note(`${formatBytes(file.size)} → ${formatBytes(after)} (−${Math.round((1 - after / file.size) * 100)}%)`);
};
