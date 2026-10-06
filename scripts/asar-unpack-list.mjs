// Prints the `asarUnpack` entries for electron-builder.yml: every package that must live outside app.asar
// (native binaries, WASM, worker scripts) plus ITS dependency closure. Run after changing those dependencies:
//   node scripts/asar-unpack-list.mjs
// and check `electron-builder.yml` still lists the same packages (the script exits 1 if it does not).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const nm = path.join(root, 'node_modules');
const ROOTS = ['sharp', 'uiohook-napi', 'tesseract.js', 'tesseract.js-core'];

const seen = new Set();
function walk(name) {
  if (seen.has(name)) return;
  const pkgFile = path.join(nm, name, 'package.json');
  if (!fs.existsSync(pkgFile)) return;                     // optional dependency not installed for this OS/CPU
  seen.add(name);
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  for (const d of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) walk(d);
}
ROOTS.forEach(walk);

// @img/* holds the per-platform native libvips builds: one wildcard covers whichever is installed.
const wanted = new Set([...seen].map((n) => (n.startsWith('@img/') ? '@img' : n)));
const lines = [...wanted].sort().map((n) => `  - node_modules/${n}/**/*`);
console.log('asarUnpack:\n' + lines.join('\n'));

const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const missing = lines.filter((l) => !yml.includes(l));
if (missing.length) {
  console.error('\nelectron-builder.yml is missing:\n' + missing.join('\n'));
  process.exit(1);
}
console.log('\nelectron-builder.yml already lists all of them.');
