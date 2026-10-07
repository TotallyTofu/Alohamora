// Writes src/shared/registry/*.json from the TypeScript registries, which stay the single source of truth:
// the UI imports the .ts files, the Rust core embeds these JSON files (include_str!).
// Run after changing formats.ts, tools.ts, toolOptions.ts or DEFAULT_SETTINGS. `--check` fails if they are stale (CI).
// Node 22.18+ runs .ts files directly (type stripping); the shared files only use `import type`, so this works.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from '../src/shared/formats.ts';
import * as T from '../src/shared/tools.ts';
import * as O from '../src/shared/toolOptions.ts';
import * as Ty from '../src/shared/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'shared', 'registry');
const files = {
  'formats.json': {
    formats: F.FORMATS, categoryOrder: F.CATEGORY_ORDER, categoryLabel: F.CATEGORY_LABEL, categoryNote: F.CATEGORY_NOTE,
    convertTargets: F.CONVERT_TARGETS, requiredEncoders: F.REQUIRED_ENCODERS, optionPairs: F.OPTION_PAIRS
  },
  'tools.json': { tools: T.TOOLS },
  'defaults.json': { settings: Ty.DEFAULT_SETTINGS, convert: O.DEFAULT_CONVERT_OPTIONS, edit: O.DEFAULT_EDIT, tools: O.TOOL_DEFAULTS }
};

const check = process.argv.includes('--check');
let stale = 0;
fs.mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const file = path.join(outDir, name);
  const text = JSON.stringify(data, null, 2) + '\n';
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (old === text) continue;
  if (check) { console.error(`stale: ${path.relative(root, file)} — run npm run gen:registry`); stale++; continue; }
  fs.writeFileSync(file, text);
  console.log(`wrote ${path.relative(root, file)}`);
}
if (stale) process.exit(1);
console.log(`registry ok: ${Object.keys(F.FORMATS).length} formats, ${T.TOOLS.length} tools`);
