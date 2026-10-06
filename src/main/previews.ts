import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '@shared/ipc';
import { probe, runFfmpeg, runFfmpegToBuffer } from './engines/ffmpeg';
import { cacheDir } from './paths';
import { allowFile } from './protocol';

const PLAYABLE_V = ['h264', 'vp8', 'vp9', 'av1'];
const PLAYABLE_A = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'];
const PLAYABLE_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'];
const inflight = new Map<string, Promise<void>>();

async function cacheKey(p: string): Promise<string> {
  const st = await fs.promises.stat(p);
  return crypto.createHash('sha1').update(`${p}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
}

/** A kfile:// URL Chromium can play: the file itself, or a cached 480p H.264 / WAV proxy. */
export async function previewMedia(p: string): Promise<{ url: string; isProxy: boolean }> {
  const pr = await probe(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const vOk = !pr.video || PLAYABLE_V.includes(pr.video.codec);
  const aOk = !pr.audio || PLAYABLE_A.includes(pr.audio.codec);
  if (PLAYABLE_EXT.includes(ext) && vOk && aOk) return { url: allowFile(p), isProxy: false };
  const isVideo = !!pr.video;
  const out = path.join(cacheDir('proxies'), `${await cacheKey(p)}.${isVideo ? 'mp4' : 'wav'}`);
  if (!fs.existsSync(out)) {
    let job = inflight.get(out);
    if (!job) {
      const tmp = out.replace(/\.(mp4|wav)$/, '.part.$1');
      const args = isVideo
        ? ['-i', p, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale=-2:'min(ih,480)'", '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '28', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp]
        : ['-i', p, '-map', '0:a:0', '-c:a', 'pcm_s16le', tmp];
      job = runFfmpeg(args).then(() => fs.promises.rename(tmp, out)).finally(() => inflight.delete(out));
      inflight.set(out, job);
    }
    await job;
  }
  return { url: allowFile(out), isProxy: true };
}

export async function previewFrame(p: string, t: number, maxWidth: number): Promise<string> {
  const buf = await runFfmpegToBuffer(['-ss', Math.max(0, t).toFixed(3), '-i', p, '-frames:v', '1', '-vf', `scale='min(${maxWidth},iw)':-2`,
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1']);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const waveCache = new Map<string, string>();
export async function previewWaveform(p: string, width: number, height: number): Promise<string> {
  const key = `${p}|${width}x${height}`;
  const hit = waveCache.get(key);
  if (hit) return hit;
  const w = Math.max(64, Math.round(width / 2) * 2);
  const h = Math.max(32, Math.round(height / 2) * 2);
  const buf = await runFfmpegToBuffer(['-i', p, '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=${w}x${h}:colors=0x8A8A8A`,
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
  const url = `data:image/png;base64,${buf.toString('base64')}`;
  waveCache.set(key, url);
  return url;
}

export function registerPreviewIpc(): void {
  ipcMain.handle(IPC.previewMedia, (_e, p: string) => previewMedia(p));
  ipcMain.handle(IPC.previewWaveform, (_e, p: string, w: number, h: number) => previewWaveform(p, Number(w) || 800, Number(h) || 120));
  ipcMain.handle(IPC.previewFrame, (_e, p: string, t: number, w: number) => previewFrame(p, Number(t) || 0, Number(w) || 640));
}
