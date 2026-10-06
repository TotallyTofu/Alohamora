import { withDefaults, type AudioVisualizeOptions } from '@shared/toolOptions';
import { runFfmpeg } from '../../engines/ffmpeg';
import { visualizeArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts } from './common';

export const runAudioVisualize: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<AudioVisualizeOptions>('audio.visualize', options);
  const f = await audioFacts(file);
  const ext = o.kind === 'waveform-mp4' ? 'mp4' : 'png';
  const suffix = o.kind === 'spectrogram-png' ? 'spectrogram' : 'waveform';
  const out = ctx.newOutput({ source: file.path, ext, suffix });
  await runFfmpeg(visualizeArgs(file.path, out, o), {
    durationSec: o.kind === 'waveform-mp4' ? f.durationSec : undefined, signal: ctx.signal, onProgress: (p) => ctx.progress(p)
  });
};
