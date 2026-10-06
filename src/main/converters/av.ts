import { FORMATS, outputExt } from '@shared/formats';
import { DEFAULT_CONVERT_OPTIONS, type ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { probe, runFfmpeg } from '../engines/ffmpeg';
import { audioConvertArgs, canRemux, toFacts, videoConvertArgs } from '../engines/ffmpegArgs';
import type { JobContext } from '../jobs/context';

export async function convertAv(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const facts = toFacts(await probe(file.path));
  const targetCat = FORMATS[target].category;
  if (targetCat === 'audio' && !facts.hasAudio) throw new UserError(`${file.name} has no audio track.`);
  if (targetCat === 'video' && !facts.hasVideo) throw new UserError(`${file.name} has no video track.`);
  const out = ctx.newOutput({ source: file.path, ext: outputExt(target) });
  const q = { crf: ctx.settings.videoCrf, audioKbps: ctx.settings.audioBitrateKbps };
  const gif = { width: opts.gifWidth ?? DEFAULT_CONVERT_OPTIONS.gifWidth, fps: opts.gifFps ?? DEFAULT_CONVERT_OPTIONS.gifFps };
  const args = file.category === 'audio'
    ? audioConvertArgs(file.path, out, facts, target, q, true)
    : videoConvertArgs(file.path, out, facts, target, q, gif);
  await runFfmpeg(args, { durationSec: facts.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  if (file.category === 'video' && canRemux(facts, target)) ctx.note('Copied streams without re-encoding');
}
