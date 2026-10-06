import { withDefaults, type JoinOptions } from '@shared/toolOptions';
import { runFfmpeg } from '../../engines/ffmpeg';
import { joinAudioArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { orderFiles } from '../video/join';
import { audioFacts, sameAudioFmt, toolAudioQuality } from './common';

export const runAudioJoin: ToolRunFn = async (files, options, ctx) => {
  const o = withDefaults<JoinOptions>('audio.join', options);
  const ordered = orderFiles(files, o.order);
  const facts = [];
  for (const f of ordered) facts.push(await audioFacts(f));
  const first = ordered[0];
  const fmt = sameAudioFmt(first);
  const out = ctx.newOutput({ source: first.path, ext: fmt, suffix: 'joined' });
  const total = facts.reduce((n, f) => n + f.durationSec, 0);
  await runFfmpeg(joinAudioArgs(ordered.map((f) => f.path), out, fmt, toolAudioQuality(ctx), facts[0]), {
    durationSec: total, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
};
