import type { FileInfo, Fmt } from '@shared/types';
import { CanceledError, UserError } from '../../errors';
import { probe, runFfmpeg, type FfmpegRunOptions } from '../../engines/ffmpeg';
import { toFacts, type MediaFacts, type Quality } from '../../engines/ffmpegArgs';
import type { JobContext } from '../../jobs/context';

export async function videoFacts(file: FileInfo): Promise<MediaFacts> {
  const f = toFacts(await probe(file.path));
  if (!f.hasVideo) throw new UserError(`${file.name} has no video track.`);
  return f;
}

/** Tools re-encode at high quality to avoid visible generation loss. */
export const toolQuality = (ctx: JobContext): Quality => ({ crf: Math.min(ctx.settings.videoCrf, 20), audioKbps: ctx.settings.audioBitrateKbps });

/** Tools keep the input container (fmt) so users get back what they gave. */
export const sameFmt = (file: FileInfo): Fmt => file.fmt ?? 'mp4';

/** The verified hardware H.264 encoder to use for this job, or null for the CPU. */
export const hwFor = (ctx: JobContext): string | null => (ctx.settings.hardwareVideo ? ctx.caps.hwVideo : null);

/** Run FFmpeg with the hardware encoder; if that fails, retry once on the CPU and say so on the Done card. */
export async function runWithHwFallback(ctx: JobContext, build: (hw: string | null) => string[], opts: FfmpegRunOptions): Promise<void> {
  const hw = hwFor(ctx);
  try {
    await runFfmpeg(build(hw), opts);
  } catch (e) {
    if (!hw || e instanceof CanceledError || ctx.signal.aborted) throw e;
    ctx.note('Hardware encoder failed — used CPU');
    await runFfmpeg(build(null), opts);
  }
}
