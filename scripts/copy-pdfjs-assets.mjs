import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'src', 'renderer', 'public', 'pdfjs');
let copied = 0;
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) continue;              // wasm/iccs only exist in newer pdf.js
  fs.cpSync(from, path.join(dest, dir), { recursive: true });
  copied++;
}
if (copied < 2) { console.error('pdfjs-dist assets not found in', src); process.exit(1); }
console.log(`pdf.js assets copied (${copied} folders) →`, dest);
