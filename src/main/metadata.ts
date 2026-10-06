import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { MetadataField, MetadataInfo } from '@shared/types';
import { fmtFromPath, categoryOf } from '@shared/formats';
import { probe, runFfmpegToBuffer } from './engines/ffmpeg';

const VIDEO_KEYS: Array<[string, string]> = [['title', 'Title'], ['artist', 'Author'], ['comment', 'Comment'], ['date', 'Date'], ['description', 'Description']];
const AUDIO_KEYS: Array<[string, string]> = [['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['album_artist', 'Album artist'], ['date', 'Year'], ['genre', 'Genre'], ['track', 'Track'], ['comment', 'Comment']];
const READONLY: Array<[string, string]> = [['encoder', 'Encoder'], ['creation_time', 'Created'], ['location', 'Location'], ['com.apple.quicktime.location.iso6709', 'Location'], ['com.apple.quicktime.model', 'Camera']];

export async function readMediaMetadata(p: string): Promise<MetadataInfo> {
  const pr = await probe(p);
  const fmt = fmtFromPath(p);
  const keys = fmt && categoryOf(fmt) === 'audio' ? AUDIO_KEYS : VIDEO_KEYS;
  const fields: MetadataField[] = keys.map(([key, label]) => ({ key, label, value: pr.tags[key] ?? '', editable: true }));
  for (const [key, label] of READONLY) if (pr.tags[key]) fields.push({ key, label, value: pr.tags[key], editable: false });
  let coverDataUrl: string | undefined;
  if (pr.hasCover) {
    const buf = await runFfmpegToBuffer(['-i', p, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=256:256:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']);
    coverDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  const hasGps = Object.keys(pr.tags).some((k) => k.includes('location'));
  return { kind: 'media', fields, hasGps, hasCover: pr.hasCover, coverDataUrl };
}

export function registerMetadataIpc(): void {
  ipcMain.handle(IPC.readMetadata, async (_e, p: string) => {
    const fmt = fmtFromPath(p);
    const cat = fmt ? categoryOf(fmt) : null;
    if (cat === 'video' || cat === 'audio') return readMediaMetadata(p);
    // Task 9.7 adds 'image', Task 10.7 adds 'pdf'
    throw new Error('No metadata reader for this file type');
  });
}
