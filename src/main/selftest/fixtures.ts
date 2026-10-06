import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../engines/ffmpeg';

type Maker = (out: string, dir: string) => Promise<void>;

export const FIXTURES: Record<string, Maker> = {
  'video.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out]),
  'video-noaudio.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]),
  'video.mkv': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', out]); },
  'anim.gif': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-t', '2', '-vf', 'fps=10,scale=160:-1', out]); },
  'audio.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-ac', '2', '-c:a', 'pcm_s16le', out]),
  'audio.mp3': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'audio.wav'), '-c:a', 'libmp3lame', '-q:a', '4', out]); },
  'stereo-lr.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4',
    '-filter_complex', '[0:a][1:a]join=inputs=2:channel_layout=stereo[a]', '-map', '[a]', '-c:a', 'pcm_s16le', out])
};

/** Create the fixture once (cached in the fixtures dir) and return its path. */
export async function ensureFixture(dir: string, name: string): Promise<string> {
  const out = path.join(dir, name);
  if (fs.existsSync(out)) return out;
  const make = FIXTURES[name];
  if (!make) throw new Error(`No fixture maker for ${name}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `tmp-${name}`);        // keeps the extension for FFmpeg
  await make(tmp, dir);
  await fs.promises.rename(tmp, out);
  return out;
}
