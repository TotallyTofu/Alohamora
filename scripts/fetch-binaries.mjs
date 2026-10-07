// Downloads everything the app bundles, ONCE, at build time (the app itself never downloads anything):
//   src-tauri/binaries/ffmpeg-<triple>, ffprobe-<triple>   (Tauri sidecars: the name must end with the target triple)
//   src-tauri/resources/pdfium/                          (PDFium shared library, bblanchon/pdfium-binaries)
//   src-tauri/resources/tessdata/                        (OCR languages: eng, vie)
//   src-tauri/resources/fonts/                           (Noto Sans / Serif / Sans Mono for text → PDF)
// Options: --target=<platform-arch> (e.g. darwin-x64), --ffmpeg-dir=<folder with ffmpeg + ffprobe> (offline/mirror).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import extract from 'extract-zip';

const root = path.resolve(import.meta.dirname, '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = arg('target') ?? `${process.platform}-${process.arch}`;          // e.g. darwin-arm64
const [platform] = target.split('-');
const exe = (name) => (platform === 'win32' ? `${name}.exe` : name);
const TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu'
}[target];
if (!TRIPLE) { console.error(`Unsupported target ${target}`); process.exit(1); }

const tauriDir = path.join(root, 'src-tauri');
const binDir = path.join(tauriDir, 'binaries');
const resDir = path.join(tauriDir, 'resources');
const tmp = path.join(root, '.cache', 'downloads', target);

const RIEDL = (os, a, file) => `https://ffmpeg.martin-riedl.de/redirect/latest/${os}/${a}/release/${file}`;
const FFMPEG = {
  'win32-x64': [{ url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zip: 'ffmpeg-win.zip', files: ['ffmpeg.exe', 'ffprobe.exe'] }],
  'darwin-arm64': [{ url: RIEDL('macos', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'darwin-x64': [{ url: RIEDL('macos', 'amd64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'amd64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-x64': [{ url: RIEDL('linux', 'amd64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'amd64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-arm64': [{ url: RIEDL('linux', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }]
}[target];

// PDFium build tested with pdfium-render 0.9.4. Change both together.
const PDFIUM_TAG = 'chromium%2F8086';
const PDFIUM = {
  'win32-x64': { asset: 'pdfium-win-x64.tgz', lib: 'bin/pdfium.dll' },
  'darwin-arm64': { asset: 'pdfium-mac-arm64.tgz', lib: 'lib/libpdfium.dylib' },
  'darwin-x64': { asset: 'pdfium-mac-x64.tgz', lib: 'lib/libpdfium.dylib' },
  'linux-x64': { asset: 'pdfium-linux-x64.tgz', lib: 'lib/libpdfium.so' },
  'linux-arm64': { asset: 'pdfium-linux-arm64.tgz', lib: 'lib/libpdfium.so' }
}[target];

const TESS = {
  eng: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata',
  vie: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/vie.traineddata'
};

const NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts';
const FONTS = [
  'NotoSans/hinted/ttf/NotoSans-Regular.ttf', 'NotoSans/hinted/ttf/NotoSans-Bold.ttf',
  'NotoSans/hinted/ttf/NotoSans-Italic.ttf', 'NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf',
  'NotoSerif/hinted/ttf/NotoSerif-Regular.ttf', 'NotoSerif/hinted/ttf/NotoSerif-Bold.ttf',
  'NotoSerif/hinted/ttf/NotoSerif-Italic.ttf', 'NotoSerif/hinted/ttf/NotoSerif-BoldItalic.ttf',
  'NotoSansMono/hinted/ttf/NotoSansMono-Regular.ttf', 'NotoSansMono/hinted/ttf/NotoSansMono-Bold.ttf'
];

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

/** macOS/Linux: make executable. macOS: drop quarantine and keep a valid signature (ad-hoc sign if needed). */
function prepareBinary(file) {
  if (platform === 'win32') return;
  fs.chmodSync(file, 0o755);
  if (platform !== 'darwin' || process.platform !== 'darwin') return;   // can only sign on a Mac
  try { execFileSync('xattr', ['-d', 'com.apple.quarantine', file], { stdio: 'ignore' }); } catch { /* not quarantined */ }
  try { execFileSync('codesign', ['--verify', file], { stdio: 'ignore' }); }
  catch { execFileSync('codesign', ['--force', '--sign', '-', file]); console.log('ad-hoc signed', path.basename(file)); }
}

/** Sidecar file name Tauri expects: ffmpeg-x86_64-pc-windows-msvc.exe */
const sidecar = (name) => path.join(binDir, platform === 'win32' ? `${name}-${TRIPLE}.exe` : `${name}-${TRIPLE}`);

async function fetchFfmpeg() {
  if (fs.existsSync(sidecar('ffmpeg')) && fs.existsSync(sidecar('ffprobe'))) { console.log('ffmpeg already present for', target); return; }
  fs.mkdirSync(binDir, { recursive: true });
  const local = arg('ffmpeg-dir') ?? process.env.ALOHAMORA_FFMPEG_DIR;
  if (local) {
    for (const name of ['ffmpeg', 'ffprobe']) {
      fs.copyFileSync(path.join(local, exe(name)), sidecar(name));
      prepareBinary(sidecar(name));
    }
    const lic = ['LICENSE', 'LICENSE.txt', 'COPYING.GPLv3'].map((n) => path.join(local, n)).find((f) => fs.existsSync(f));
    if (lic) fs.copyFileSync(lic, path.join(resDir, 'LICENSE-ffmpeg.txt'));
    return;
  }
  for (const s of FFMPEG) {
    const zip = path.join(tmp, s.zip);
    await download(s.url, zip);
    const out = path.join(tmp, `${s.zip}-extract`);
    fs.rmSync(out, { recursive: true, force: true });
    await extract(zip, { dir: out });
    for (const name of s.files) {
      const src = findFile(out, name);
      if (!src) throw new Error(`${name} not found inside ${s.zip}`);
      const dest = sidecar(name.replace(/\.exe$/, ''));
      fs.copyFileSync(src, dest);
      prepareBinary(dest);
    }
    const lic = findFile(out, 'LICENSE') ?? findFile(out, 'LICENSE.txt') ?? findFile(out, 'COPYING.GPLv3');
    if (lic) fs.copyFileSync(lic, path.join(resDir, 'LICENSE-ffmpeg.txt'));
  }
}

async function fetchPdfium() {
  const dir = path.join(resDir, 'pdfium');
  const libName = path.basename(PDFIUM.lib);
  if (fs.existsSync(path.join(dir, libName))) { console.log('pdfium already present'); return; }
  const tgz = path.join(tmp, PDFIUM.asset);
  await download(`https://github.com/bblanchon/pdfium-binaries/releases/download/${PDFIUM_TAG}/${PDFIUM.asset}`, tgz);
  const out = path.join(tmp, 'pdfium-extract');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', out]);       // tar ships with Windows 10+, macOS and Linux
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(out, PDFIUM.lib), path.join(dir, libName));
  fs.copyFileSync(path.join(out, 'LICENSE'), path.join(dir, 'LICENSE-pdfium.txt'));
}

async function main() {
  fs.mkdirSync(resDir, { recursive: true });
  await fetchFfmpeg();
  // The bundler requires this file; builds without a licence file in the archive get a pointer to the GPL text.
  const ffLicense = path.join(resDir, 'LICENSE-ffmpeg.txt');
  if (!fs.existsSync(ffLicense)) fs.writeFileSync(ffLicense, 'FFmpeg is free software licensed under the GNU General Public License (GPL).\nLicence and source code: https://ffmpeg.org/legal.html\n');
  await fetchPdfium();
  for (const [lang, url] of Object.entries(TESS)) await download(url, path.join(resDir, 'tessdata', `${lang}.traineddata`));
  for (const f of FONTS) await download(`${NOTO}/${f}`, path.join(resDir, 'fonts', path.basename(f)));
  console.log('Done. Sidecars in', binDir, '· resources in', resDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
