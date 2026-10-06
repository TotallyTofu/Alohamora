import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../../errors';
import { probe } from '../../engines/ffmpeg';
import { toFacts, type MediaFacts, type Quality } from '../../engines/ffmpegArgs';
import type { JobContext } from '../../jobs/context';

export async function audioFacts(file: FileInfo): Promise<MediaFacts> {
  const f = toFacts(await probe(file.path));
  if (!f.hasAudio) throw new UserError(`${file.name} has no audio track.`);
  return f;
}

/** Audio tools re-encode at a generous bitrate to avoid audible generation loss. */
export const toolAudioQuality = (ctx: JobContext): Quality => ({ crf: 23, audioKbps: Math.max(192, ctx.settings.audioBitrateKbps) });

/** Tools keep the input container so users get back what they gave. */
export const sameAudioFmt = (file: FileInfo): Fmt => file.fmt ?? 'mp3';
