import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../../errors';
import { probe } from '../../engines/ffmpeg';
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
