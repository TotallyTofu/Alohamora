import { withDefaults, type AudioTrimOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { trimAudioArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt, toolAudioQuality } from './common';

export const runAudioTrim: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioTrimOptions>('audio.trim', options);
  const f = await audioFacts(file);
  const end = o.endSec > 0 ? Math.min(o.endSec, f.durationSec) : f.durationSec;
  if (end - o.startSec < 0.1) throw new UserError('The selection is too short.');
  const fmt = sameAudioFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'trimmed' });
  await runFfmpeg(trimAudioArgs(file.path, out, f, o, fmt, toolAudioQuality(ctx)), {
    durationSec: end - o.startSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
};
