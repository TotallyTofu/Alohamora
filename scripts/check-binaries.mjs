// Verifies that everything fetch-binaries.mjs provides is present and usable on THIS machine.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu', 'linux-arm64': 'aarch64-unknown-linux-gnu'
}[`${process.platform}-${process.arch}`];
const res = path.join(root, 'src-tauri', 'resources');
const bin = (n) => path.join(root, 'src-tauri', 'binaries', process.platform === 'win32' ? `${n}-${TRIPLE}.exe` : `${n}-${TRIPLE}`);
const NEED = ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'mpeg4', 'libmp3lame', 'wmv2', 'wmav2', 'gif', 'flac', 'libvorbis', 'pcm_s16le', 'pcm_s16be', 'bmp'];
let ok = true;
const fail = (msg) => { ok = false; console.log(`✗ ${msg}`); };

for (const n of ['ffmpeg', 'ffprobe']) {
  try {
    const v = execFileSync(bin(n), ['-version']).toString().split('\n')[0];
    console.log(`✓ ${v}`);
    const m = /version n?(\d+)\.(\d+)/.exec(v);
    // HEIC photos from phones are tiled ("grid") images: FFmpeg decodes them whole only from 7.1 on.
    if (n === 'ffmpeg' && m && (Number(m[1]) < 7 || (Number(m[1]) === 7 && Number(m[2]) < 1))) fail('FFmpeg 7.1 or newer is required (HEIC input)');
  } catch (e) { fail(`${n} does not run: ${e.message}`); }
}
try {
  const enc = execFileSync(bin('ffmpeg'), ['-hide_banner', '-encoders']).toString();
  for (const e of NEED) { if (new RegExp(`\\s${e.replace(/-/g, '\\-')}\\s`).test(enc)) console.log(`✓ encoder ${e}`); else fail(`encoder ${e}`); }
} catch { fail('ffmpeg -encoders'); }
const lib = { win32: 'pdfium.dll', darwin: 'libpdfium.dylib', linux: 'libpdfium.so' }[process.platform];
if (fs.existsSync(path.join(res, 'pdfium', lib))) console.log(`✓ pdfium ${lib}`); else fail(`pdfium ${lib}`);
for (const lang of ['eng', 'vie']) {
  const f = path.join(res, 'tessdata', `${lang}.traineddata`);
  if (fs.existsSync(f) && fs.statSync(f).size > 100_000) console.log(`✓ tessdata ${lang}`); else fail(`tessdata ${lang}`);
}
for (const font of ['NotoSans-Regular.ttf', 'NotoSerif-Regular.ttf', 'NotoSansMono-Regular.ttf']) {
  if (fs.existsSync(path.join(res, 'fonts', font))) console.log(`✓ font ${font}`); else fail(`font ${font}`);
}
console.log(ok ? '\nAll required binaries OK' : '\nSome required binaries are missing — run npm run fetch-binaries');
process.exit(ok ? 0 : 1);
