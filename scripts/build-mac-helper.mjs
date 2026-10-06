import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') { console.log('build-mac-helper: not macOS, skipped'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'native', 'mac', 'DragHelper.swift');
for (const [arch, triple] of [['arm64', 'arm64-apple-macos12'], ['x64', 'x86_64-apple-macos12']]) {
  const outDir = path.join(root, 'resources', 'bin', `darwin-${arch}`);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'kabooks-drag-helper');
  execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', triple, '-o', out, src], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', out]);   // ad-hoc; electron-builder re-signs with your Developer ID
  console.log('built', out);
}
