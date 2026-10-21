// Downloads everything the app bundles, ONCE, at build time (the app itself never downloads anything):
//   src-tauri/binaries/ffmpeg-<triple>, ffprobe-<triple>   (Tauri sidecars: the name must end with the target triple)
//   src-tauri/resources/pdfium/                          (PDFium shared library, bblanchon/pdfium-binaries)
//   src-tauri/resources/tessdata/                        (OCR languages: eng, vie)
//   src-tauri/resources/fonts/                           (Noto Sans / Serif / Sans Mono for text → PDF)
// Options: --target=<platform-arch> (e.g. darwin-x64), --ffmpeg-dir=<folder with ffmpeg + ffprobe> (offline/mirror; not checked).
// Every download is pinned to one exact file and its SHA-256: these files ship inside the installers, so a file that changed
// on a download site must stop the build. To update one, change its URL and its hash together.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
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

// Windows: gyan.dev "essentials" build. gyan.dev deletes old versions, so the pin points at its GitHub mirror (same files, kept).
// macOS and Linux: Martin Riedl's builds. Each build has its own folder, <unix time>_<version>, and a .sha256 next to every zip.
// ffmpeg.martin-riedl.de was down (HTTP 521) on 2026-10-21, so none is pinned yet: Linux stops here (sha256: null; use
// --ffmpeg-dir) and macOS uses osxexperts.net FOR NOW (FFmpeg 9.0 Apple Silicon, 8.0 Intel; listed on ffmpeg.org). osxexperts
// publishes no checksums (these are the files downloaded on 2026-10-21) and reuses its file names, so a mismatch means a new
// upload. When Riedl is back, pin its 9.0.2 build (the one CI used on 2026-10-13) for macOS and Linux.
const RIEDL = (os, a, build, file) => `https://ffmpeg.martin-riedl.de/download/${os}/${a}/${build}/${file}`;
const riedl = (os, a, build, ffmpegSha, ffprobeSha) => [
  { url: RIEDL(os, a, build, 'ffmpeg.zip'), sha256: ffmpegSha, zip: 'ffmpeg.zip', files: ['ffmpeg'] },
  { url: RIEDL(os, a, build, 'ffprobe.zip'), sha256: ffprobeSha, zip: 'ffprobe.zip', files: ['ffprobe'] }
];
const FFMPEG = {
  'win32-x64': [{ url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip', sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba', zip: 'ffmpeg-win.zip', files: ['ffmpeg.exe', 'ffprobe.exe'] }],
  'darwin-arm64': [
    { url: 'https://www.osxexperts.net/ffmpeg9arm.zip', sha256: 'd0c06c5c68ce48af3143b262f7a9118a7c9f67de1e237fcc24ffb14df9c67af9', zip: 'ffmpeg.zip', files: ['ffmpeg'] },
    { url: 'https://www.osxexperts.net/ffprobe9arm.zip', sha256: '0c94fbdd8917022f28115eca512196cf4648732bc9e5db9ec8896c7e519d02aa', zip: 'ffprobe.zip', files: ['ffprobe'] }
  ],
  'darwin-x64': [
    { url: 'https://www.osxexperts.net/ffmpeg80intel.zip', sha256: '2d24d22db78c87f394a5822867acd5c5dc5e762cd261a44bd26923f3a5af3e07', zip: 'ffmpeg.zip', files: ['ffmpeg'] },
    { url: 'https://www.osxexperts.net/ffprobe80intel.zip', sha256: '0b6576104a95c1b39d4939e2df86f8f7cf1d55287ff57da48777d94605d12feb', zip: 'ffprobe.zip', files: ['ffprobe'] }
  ],
  'linux-x64': riedl('linux', 'amd64', null, null, null),
  'linux-arm64': riedl('linux', 'arm64', null, null, null)
}[target];

// PDFium build tested with pdfium-render 0.9.4. Change both together. (The release is immutable; hashes = GitHub's asset digests.)
const PDFIUM_TAG = 'chromium%2F8086';
const PDFIUM = {
  'win32-x64': { asset: 'pdfium-win-x64.tgz', lib: 'bin/pdfium.dll', sha256: '1fd8af952832dbb0eb16d9249f68fe09e5f5ebf7c3dd9f6066ea2720cc28487d' },
  'darwin-arm64': { asset: 'pdfium-mac-arm64.tgz', lib: 'lib/libpdfium.dylib', sha256: 'e98679e052c07edbb5a627980902abb823d4b3f35744d877bd21668bd9fc13ab' },
  'darwin-x64': { asset: 'pdfium-mac-x64.tgz', lib: 'lib/libpdfium.dylib', sha256: '933a85a138f6027243c56bff8676375c33ceeb767401389415ffc44d689ca85d' },
  'linux-x64': { asset: 'pdfium-linux-x64.tgz', lib: 'lib/libpdfium.so', sha256: '588577cf52dabc1a444988bac841920df54cc2f141801424de97ab04f4fbb935' },
  'linux-arm64': { asset: 'pdfium-linux-arm64.tgz', lib: 'lib/libpdfium.so', sha256: 'e7e2fe4686925618330103cb167950aca5a84bb00fd977a41b86be59dd1480a2' }
}[target];

// tessdata_fast at a fixed commit (eng and vie last changed in 2017).
const TESSDATA = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd';
const TESS = {
  eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  vie: '79df64caf7bcfb2a27df5042ecb6121e196eada34da774956995747636d5bfa1'
};

const NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/93fac8abebe6c7fed0c5b7d2456d8fa484fa146c/fonts';
const FONTS = {
  'NotoSans/hinted/ttf/NotoSans-Regular.ttf': '478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823',
  'NotoSans/hinted/ttf/NotoSans-Bold.ttf': '1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913',
  'NotoSans/hinted/ttf/NotoSans-Italic.ttf': '467e3f89eeca4108bb8710a2b9e0cf2281ac56d5b0609211a83776d0505eecb5',
  'NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf': '1b602a9d6353be42c91df097a4857b69fa2696f26703d7a33b54a15d87c2622c',
  'NotoSerif/hinted/ttf/NotoSerif-Regular.ttf': '19e72cd8d595fae5bd74a5206f5d938512e1183d4fed7abb1ec1be1d7efa5f88',
  'NotoSerif/hinted/ttf/NotoSerif-Bold.ttf': '96656aa5cec8f1d6fd0e804c1fad397e1a1cfa082e6642124e0bda68cd8363ce',
  'NotoSerif/hinted/ttf/NotoSerif-Italic.ttf': '749e80e313ef711f9373c6cce17c72297ef05490b3dcda7967d1d5d90bf1183f',
  'NotoSerif/hinted/ttf/NotoSerif-BoldItalic.ttf': 'c710c5b9cf354ae46e7a10472a08019b28220fafeb5887a482a76856f8f6fc0b',
  'NotoSansMono/hinted/ttf/NotoSansMono-Regular.ttf': '65b5e2b2c4a1fba9ae8be1f026cb35b03dcb8886d9b2a4147054fde12f7e767d',
  'NotoSansMono/hinted/ttf/NotoSansMono-Bold.ttf': 'a21ea0ba6ea49fda7b34ca39a504b487f1130885d36e1a4f9f4255b3ba6994bc'
};

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Downloads url to dest unless dest already is the pinned file. A different SHA-256 stops the build. */
async function download(url, dest, sha) {
  if (!sha) throw new Error(`No SHA-256 pinned for ${url}: pin it in scripts/fetch-binaries.mjs`);
  if (fs.existsSync(dest) && (await sha256(dest)) === sha) { console.log('cached  ', path.basename(dest)); return; }
  console.log('download', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
  const got = await sha256(dest + '.part');
  if (got !== sha) {
    fs.rmSync(dest + '.part');
    throw new Error(`SHA-256 mismatch for ${url}\n  expected ${sha}\n  got      ${got}`);
  }
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
  if (FFMPEG.some((s) => !s.sha256)) throw new Error(`FFmpeg for ${target} is not pinned yet (see FFMPEG in scripts/fetch-binaries.mjs): use --ffmpeg-dir=<folder with ffmpeg + ffprobe>`);
  for (const s of FFMPEG) {
    const zip = path.join(tmp, s.zip);
    await download(s.url, zip, s.sha256);
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
  await download(`https://github.com/bblanchon/pdfium-binaries/releases/download/${PDFIUM_TAG}/${PDFIUM.asset}`, tgz, PDFIUM.sha256);
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
  for (const [lang, sha] of Object.entries(TESS)) await download(`${TESSDATA}/${lang}.traineddata`, path.join(resDir, 'tessdata', `${lang}.traineddata`), sha);
  for (const [f, sha] of Object.entries(FONTS)) await download(`${NOTO}/${f}`, path.join(resDir, 'fonts', path.basename(f)), sha);
  console.log('Done. Sidecars in', binDir, '· resources in', resDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
