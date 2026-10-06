import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { runFfmpeg } from '../engines/ffmpeg';
import { encodeHeicFile } from '../engines/heif';

type Maker = (out: string, dir: string) => Promise<void>;

const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1">
<stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#2b6cff"/></linearGradient></defs>
<rect x="40" y="40" width="720" height="520" rx="60" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>`;

export const FIXTURES: Record<string, Maker> = {
  'video.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out]),
  'video-noaudio.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]),
  'video.mkv': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', out]); },
  'anim.gif': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-t', '2', '-vf', 'fps=10,scale=160:-1', out]); },
  'audio.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-ac', '2', '-c:a', 'pcm_s16le', out]),
  'audio.mp3': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'audio.wav'), '-c:a', 'libmp3lame', '-q:a', '4', out]); },
  'stereo-lr.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4',
    '-filter_complex', '[0:a][1:a]join=inputs=2:channel_layout=stereo[a]', '-map', '[a]', '-c:a', 'pcm_s16le', out]),
  'image.svg': async (out) => { await fs.promises.writeFile(out, TEST_SVG, 'utf8'); },
  'image.png': async (out) => { await sharp(Buffer.from(TEST_SVG), { density: 72 }).png().toFile(out); },            // 800x600, transparent corners
  'photo.jpg': async (out) => {                                                                                     // 800x600 pixels + EXIF orientation 6
    await sharp(Buffer.from(TEST_SVG), { density: 72 }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 })
      .withMetadata({ orientation: 6 }).toFile(out);
  },
  'image.webp': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).webp().toFile(out); },
  'image.tiff': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).tiff().toFile(out); },
  'image.avif': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).avif().toFile(out); },
  'image.bmp': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'image.png'), '-pix_fmt', 'bgr24', out]); },
  'image.heic': async (out, dir) => { await encodeHeicFile(await ensureFixture(dir, 'image.png'), out, 80); },
  'text.txt': async (out) => {
    await fs.promises.writeFile(out, [
      'Kabooks test document',
      'Xin chào thế giới — Tiếng Việt có dấu.',
      'The quick brown fox jumps over the lazy dog. '.repeat(4).trim(),
      '',
      'Last line.'
    ].join('\n'), 'utf8');
  },
  'subs.srt': async (out) => {
    await fs.promises.writeFile(out, '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nThird\r\n', 'utf8');
  },
  'subs.vtt': async (out) => {
    await fs.promises.writeFile(out, 'WEBVTT\n\nNOTE test file\n\n00:01.000 --> 00:02.500 align:start\nHello <v Bob>world</v>\n\nid2\n00:00:03.000 --> 00:00:04.000\nSecond line\n', 'utf8');
  }
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
