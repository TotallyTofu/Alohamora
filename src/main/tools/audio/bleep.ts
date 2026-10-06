import { withDefaults, type AudioBleepOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { bleepArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt, toolAudioQuality } from './common';

export const runAudioBleep: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioBleepOptions>('audio.bleep', options);
  const f = await audioFacts(file);
  const ranges = o.ranges
    .map((r) => ({ startSec: Math.max(0, r.startSec), endSec: Math.min(f.durationSec, r.endSec) }))
    .filter((r) => r.endSec - r.startSec > 0.01);
  if (ranges.length === 0) throw new UserError('Add at least one part to bleep.');
  const fmt = sameAudioFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'bleeped' });
  await runFfmpeg(bleepArgs(file.path, out, f, { ...o, ranges }, fmt, toolAudioQuality(ctx)), {
    durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
  ctx.note(`${ranges.length} part${ranges.length === 1 ? '' : 's'} ${o.sound === 'beep' ? 'bleeped' : 'silenced'}`);
};
