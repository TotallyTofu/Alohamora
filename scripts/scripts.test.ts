// Checks on the build scripts that CI would otherwise only catch after a push.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');

describe('gen-registry', () => {
  it('src/shared/registry/*.json match the TypeScript registries (run npm run gen:registry when this fails)', () => {
    // The Rust core embeds these JSON files, so stale ones mean the backend and the UI disagree.
    expect(() => execFileSync(process.execPath, ['scripts/gen-registry.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  });
});

// Regression (rewrite/PROGRESS.md, "Repository hygiene"): a .gitignore without the fetched binaries let `git add -A` commit
// 100 MiB FFmpeg builds, which GitHub rejects. Everything that fetch-binaries and the builds write must stay ignored.
describe('.gitignore', () => {
  it.skipIf(!fs.existsSync(path.join(root, '.git')))('ignores downloaded binaries and build output', () => {
    const generated = [
      'src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe', 'src-tauri/resources/pdfium/pdfium.dll',
      'src-tauri/resources/tessdata/eng.traineddata', 'src-tauri/resources/fonts/NotoSans-Regular.ttf',
      'src-tauri/resources/LICENSE-ffmpeg.txt', 'src-tauri/target/debug/alohamora.exe', 'src-tauri/gen/schemas/x.json',
      'node_modules/vite/package.json', 'dist/index.html', '.cache/downloads/x.zip', '.selftest/report.json'
    ];
    const ignored = execFileSync('git', ['check-ignore', '--no-index', ...generated], { cwd: root }).toString().trim().split(/\r?\n/);
    expect(ignored.sort()).toEqual([...generated].sort());
  });
});

// Regression for the 2026-10-21 security review (commit 7cffc89): every file that ships inside the installers is fetched
// from one exact URL and checked against a SHA-256, so a changed file on a download site stops the build.
describe('fetch-binaries pins', () => {
  const src = read('scripts/fetch-binaries.mjs');

  it('every hash is a full SHA-256', () => {
    const hashes = [...src.matchAll(/sha256:\s*'([^']*)'/g), ...src.matchAll(/:\s*'([0-9a-f]{40,})'/g)].map((m) => m[1]);
    expect(hashes.length).toBeGreaterThanOrEqual(15);
    for (const h of hashes) expect(h, h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('downloads use https, fixed releases or commits, never "latest"', () => {
    const urls = [...src.matchAll(/'(https?:\/\/[^']+)'/g), ...src.matchAll(/`(https?:\/\/[^`]+)`/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const u of urls) {
      expect(u, u).toMatch(/^https:\/\//);
      expect(u, u).not.toMatch(/latest/i);
    }
    expect(src).toMatch(/tessdata_fast\/[0-9a-f]{40}'/);
    expect(src).toMatch(/notofonts\.github\.io\/[0-9a-f]{40}\/fonts'/);
  });

  it('every download passes its hash, and a missing or different hash stops the script', () => {
    const calls = src.split('\n').filter((l) => l.includes('await download('));
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const line of calls) expect(line, line).toMatch(/,\s*[\w.]*sha(256)?\);\s*$/);
    expect(src).toContain('throw new Error(`No SHA-256 pinned for');
    expect(src).toContain('throw new Error(`SHA-256 mismatch for');
  });
});
