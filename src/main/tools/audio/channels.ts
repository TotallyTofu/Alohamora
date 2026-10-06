import { withDefaults, type AudioChannelsOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { channelsArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt, toolAudioQuality } from './common';

const SUFFIX: Record<AudioChannelsOptions['mode'], string> = {
  mono: 'mono', stereo: 'stereo', left: 'left', right: 'right', swap: 'swapped'
};

export const runAudioChannels: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioChannelsOptions>('audio.channels', options);
  const f = await audioFacts(file);
  if ((o.mode === 'left' || o.mode === 'right' || o.mode === 'swap') && (f.channels ?? 2) < 2) throw new UserError('This file is mono.');
  const fmt = sameAudioFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: SUFFIX[o.mode] });
  await runFfmpeg(channelsArgs(file.path, out, f, o.mode, fmt, toolAudioQuality(ctx)), {
    durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
};
