import sharp from 'sharp';
import { withDefaults, type MediaMetadataOptions } from '@shared/toolOptions';
import { runFfmpeg } from '../../engines/ffmpeg';
import { audioMetadataArgs } from '../../engines/audioArgs';
import type { ToolRunFn } from '../index';
import { audioFacts, sameAudioFmt } from './common';

const COVER_FORMATS = ['mp3', 'm4a', 'flac'];

export const runAudioMetadata: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<MediaMetadataOptions>('audio.metadata', options);
  const f = await audioFacts(file);
  const fmt = sameAudioFmt(file);
  let coverJpg: string | null = null;
  if (o.coverPath) {
    if (COVER_FORMATS.includes(fmt)) {
      coverJpg = ctx.tempPath('cover.jpg');
      await sharp(o.coverPath, { failOn: 'none' }).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toFile(coverJpg);
    } else {
      ctx.note("Cover art isn't supported for this format");
    }
  }
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: o.removeAll ? 'clean' : 'meta' });
  const args = audioMetadataArgs(file.path, out, o, fmt, f.hasCover, coverJpg);
  await runFfmpeg(args, { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  ctx.note(o.removeAll ? 'Metadata removed' : 'Metadata updated');
};
