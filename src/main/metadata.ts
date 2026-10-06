import { ipcMain } from 'electron';
import exifr from 'exifr';
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

const pad = (n: number): string => String(n).padStart(2, '0');
/** "2024-05-01T14:30" — the format of <input type="datetime-local">. */
function localInput(d: unknown): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

export async function readImageMetadata(p: string): Promise<MetadataInfo> {
  const d = (await exifr.parse(p, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false }).catch(() => null)) as
    Record<string, unknown> | null;
  const fields: MetadataField[] = [];
  const ro = (key: string, label: string, value: string): void => { if (value) fields.push({ key, label, value, editable: false }); };
  ro('make', 'Camera make', str(d?.Make));
  ro('model', 'Camera', str(d?.Model));
  ro('lens', 'Lens', str(d?.LensModel));
  fields.push({ key: 'dateTaken', label: 'Date taken', value: localInput(d?.DateTimeOriginal), editable: true });
  ro('exposure', 'Exposure', typeof d?.ExposureTime === 'number' ? (d.ExposureTime < 1 ? `1/${Math.round(1 / d.ExposureTime)} s` : `${d.ExposureTime} s`) : '');
  ro('aperture', 'Aperture', typeof d?.FNumber === 'number' ? `f/${d.FNumber}` : '');
  ro('iso', 'ISO', str(d?.ISO));
  ro('focal', 'Focal length', typeof d?.FocalLength === 'number' ? `${d.FocalLength} mm` : '');
  ro('software', 'Software', str(d?.Software));
  fields.push({ key: 'artist', label: 'Artist', value: str(d?.Artist), editable: true });
  fields.push({ key: 'copyright', label: 'Copyright', value: str(d?.Copyright), editable: true });
  fields.push({ key: 'description', label: 'Description', value: str(d?.ImageDescription), editable: true });
  const hasGps = typeof d?.latitude === 'number' && typeof d?.longitude === 'number';
  if (hasGps) ro('location', 'Location', `${(d?.latitude as number).toFixed(5)}, ${(d?.longitude as number).toFixed(5)}`);
  return { kind: 'image', fields, hasGps };
}

export function registerMetadataIpc(): void {
  ipcMain.handle(IPC.readMetadata, async (_e, p: string) => {
    const fmt = fmtFromPath(p);
    const cat = fmt ? categoryOf(fmt) : null;
    if (cat === 'video' || cat === 'audio') return readMediaMetadata(p);
    if (cat === 'image') return readImageMetadata(p);
    // Task 10.7 adds 'pdf'
    throw new Error('No metadata reader for this file type');
  });
}
