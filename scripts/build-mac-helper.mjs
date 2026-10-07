// macOS only: builds the global-drag helper (native/mac/DragHelper.swift) as a Tauri sidecar for both Mac targets.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') { console.log('build-mac-helper: not macOS, skipped'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'native', 'mac', 'DragHelper.swift');
const outDir = path.join(root, 'src-tauri', 'binaries');
fs.mkdirSync(outDir, { recursive: true });
for (const [swiftTarget, triple] of [['arm64-apple-macos12', 'aarch64-apple-darwin'], ['x86_64-apple-macos12', 'x86_64-apple-darwin']]) {
  const out = path.join(outDir, `alohamora-drag-helper-${triple}`);
  execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', swiftTarget, '-o', out, src], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', out]);   // ad-hoc; tauri build re-signs with your Developer ID
  console.log('built', out);
}
