import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = `${process.platform}-${process.arch}`;
const bin = (n) => path.join(root, 'resources', 'bin', target, process.platform === 'win32' ? `${n}.exe` : n);
const NEED = ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'mpeg4', 'libmp3lame', 'wmv2', 'wmav2', 'gif', 'flac', 'libvorbis', 'pcm_s16le', 'pcm_s16be', 'bmp'];
let ok = true;
for (const n of ['ffmpeg', 'ffprobe']) {
  try { console.log(execFileSync(bin(n), ['-version']).toString().split('\n')[0]); }
  catch (e) { ok = false; console.error(`✗ ${n} does not run: ${e.message}`); }
}
try {
  const enc = execFileSync(bin('ffmpeg'), ['-hide_banner', '-encoders']).toString();
  for (const e of NEED) { const has = new RegExp(`\\s${e.replace(/[-]/g, '\\-')}\\s`).test(enc); if (!has) ok = false; console.log(`${has ? '✓' : '✗'} encoder ${e}`); }
  for (const hw of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) if (enc.includes(` ${hw} `)) console.log(`• hardware encoder available in build: ${hw}`);
} catch { ok = false; }
for (const lang of ['eng', 'vie']) {
  const f = path.join(root, 'resources', 'tessdata', `${lang}.traineddata`);
  const has = fs.existsSync(f) && fs.statSync(f).size > 100_000;
  console.log(`${has ? '✓' : '✗'} tessdata ${lang}`);
  if (!has && lang === 'eng') ok = false;
}
console.log(ok ? '\nAll required binaries OK' : '\nSome required binaries are missing');
process.exit(ok ? 0 : 1);
