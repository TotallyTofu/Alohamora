import { withDefaults, type AudioNormalizeOptions } from '@shared/toolOptions';
import { ToolError, UserError } from '../../errors';
import { runFfmpeg, runFfmpegCapture } from '../../engines/ffmpeg';
import { loudnormPass1, loudnormPass2, parseLoudnorm } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt, toolAudioQuality } from './common';

export const runAudioNormalize: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioNormalizeOptions>('audio.normalize', options);
  const f = await audioFacts(file);
  ctx.progress(0.25, 'Measuring loudness');
  const stderr = await runFfmpegCapture(loudnormPass1(file.path, o), ctx.signal);
  const stats = parseLoudnorm(stderr);
  if (!stats) throw new ToolError('Could not measure loudness', stderr.split(/\r?\n/).slice(-15).join('\n'));
  if (stats.input_i === '-inf' || !Number.isFinite(Number(stats.input_i))) throw new UserError('This file is silent.');
  const fmt = sameAudioFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'normalized' });
  await runFfmpeg(loudnormPass2(file.path, out, f, o, stats, fmt, toolAudioQuality(ctx)), {
    durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(0.5 + p * 0.5, 'Normalizing')
  });
  ctx.note(`${Number(stats.input_i).toFixed(1)} LUFS → ${o.target} LUFS`);
};
