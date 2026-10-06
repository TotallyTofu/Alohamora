import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import extract from 'extract-zip';

const root = path.resolve(import.meta.dirname, '..');
const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);
const target = targetArg ?? `${process.platform}-${process.arch}`;          // e.g. darwin-arm64
const [platform, arch] = target.split('-');
const exe = (name) => (platform === 'win32' ? `${name}.exe` : name);
const binDir = path.join(root, 'resources', 'bin', target);
const tessDir = path.join(root, 'resources', 'tessdata');
const tmp = path.join(root, '.cache', 'downloads', target);

const RIEDL = (os, a, file) => `https://ffmpeg.martin-riedl.de/redirect/latest/${os}/${a === 'x64' ? 'amd64' : 'arm64'}/release/${file}`;
const SOURCES = {
  'win32-x64': [{ url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zip: 'ffmpeg-win.zip', files: ['ffmpeg.exe', 'ffprobe.exe'] }],
  'darwin-arm64': [{ url: RIEDL('macos', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'darwin-x64': [{ url: RIEDL('macos', 'x64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'x64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-x64': [{ url: RIEDL('linux', 'x64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'x64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-arm64': [{ url: RIEDL('linux', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }]
};
const TESS = {
  eng: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
  vie: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/vie.traineddata'
};

async function download(url, dest) {
  if (fs.existsSync(dest)) { console.log('cached  ', path.basename(dest)); return; }
  console.log('download', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
  await fs.promises.rename(dest + '.part', dest);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

/** macOS/Linux: make executable. macOS: drop quarantine, keep a valid signature (ad-hoc sign if needed). */
function prepareBinary(file) {
  if (platform === 'win32') return;
  fs.chmodSync(file, 0o755);
  if (platform !== 'darwin' || process.platform !== 'darwin') return;   // can only sign on a Mac
  try { execFileSync('xattr', ['-d', 'com.apple.quarantine', file], { stdio: 'ignore' }); } catch { /* not quarantined */ }
  try { execFileSync('codesign', ['--verify', file], { stdio: 'ignore' }); }
  catch { execFileSync('codesign', ['--force', '--sign', '-', file]); console.log('ad-hoc signed', path.basename(file)); }
}

async function main() {
  const sources = SOURCES[target];
  if (!sources) throw new Error(`Unsupported target ${target}. Use one of: ${Object.keys(SOURCES).join(', ')}`);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(tessDir, { recursive: true });
  if (!fs.existsSync(path.join(binDir, exe('ffmpeg'))) || !fs.existsSync(path.join(binDir, exe('ffprobe')))) {
    for (const s of sources) {
      const zip = path.join(tmp, s.zip);
      await download(s.url, zip);
      const out = path.join(tmp, `${s.zip}-extract`);
      fs.rmSync(out, { recursive: true, force: true });
      await extract(zip, { dir: out });
      for (const name of s.files) {
        const src = findFile(out, name);
        if (!src) throw new Error(`${name} not found inside ${s.zip}`);
        const dest = path.join(binDir, name);
        fs.copyFileSync(src, dest);
        prepareBinary(dest);
      }
      const lic = findFile(out, 'LICENSE') ?? findFile(out, 'LICENSE.txt') ?? findFile(out, 'COPYING.GPLv3');
      if (lic) fs.copyFileSync(lic, path.join(binDir, 'LICENSE-ffmpeg.txt'));
    }
  } else {
    console.log('ffmpeg already present for', target);
  }
  for (const [lang, url] of Object.entries(TESS)) await download(url, path.join(tessDir, `${lang}.traineddata`));
  console.log('Done. Binaries in', binDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
