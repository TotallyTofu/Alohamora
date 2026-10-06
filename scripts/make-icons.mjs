import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [256 + r * Math.cos(a), 256 + r * Math.sin(a)]; };

function slice(i, n, ro, ri, gapDeg) {
  const span = 360 / n;
  const a0 = i * span - span / 2 + gapDeg;
  const a1 = a0 + span - 2 * gapDeg;
  const [x1, y1] = polar(ro, a0); const [x2, y2] = polar(ro, a1);
  const [x3, y3] = polar(ri, a1); const [x4, y4] = polar(ri, a0);
  return `M${x1} ${y1} A${ro} ${ro} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 0 0 ${x4} ${y4} Z`;
}

const n = 8;
const slices = Array.from({ length: n }, (_, i) =>
  `<path d="${slice(i, n, 226, 96, 2.2)}" fill="${i === 3 ? '#FF5A1F' : '#FBFBFA'}"/>`).join('');
// The hub is a lock: a white plate with a keyhole (round head + tapered slot), centred on the wheel.
const keyhole = (fill, s = 1) => {
  const c = 256;
  const p = (dx, dy) => `${c + dx * s} ${c + dy * s}`;
  return `<g fill="${fill}"><circle cx="${c}" cy="${c + -23 * s}" r="${25 * s}"/>`
    + `<path d="M${p(-15, -9)} L${p(15, -9)} L${p(29, 48)} L${p(-29, 48)} Z"/></g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`
  + `<circle cx="256" cy="256" r="252" fill="#E2E2E0"/>${slices}`
  + `<circle cx="256" cy="256" r="78" fill="#FFFFFF" stroke="#DADAD6" stroke-width="4"/>${keyhole('#1F1F1F')}</svg>`;

// macOS menu-bar "template" glyph: black shapes + alpha only (the system tints it for light/dark menu bars).
const glyphSlices = Array.from({ length: n }, (_, i) =>
  `<path d="${slice(i, n, 240, 110, 4)}" fill="#000" fill-opacity="${i === 3 ? 1 : 0.55}"/>`).join('');
const glyph = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${glyphSlices}${keyhole('#000', 1.3)}</svg>`;

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.svg'), svg);
// 1024 px source: electron-builder derives .ico (Windows), .icns (macOS) and the Linux icon set from it.
await sharp(Buffer.from(svg), { density: 144 }).resize(1024, 1024).png().toFile(path.join(root, 'build', 'icon.png'));
await sharp(Buffer.from(svg)).resize(32, 32).png().toFile(path.join(root, 'resources', 'tray.png'));               // Windows/Linux tray
await sharp(Buffer.from(glyph)).resize(18, 18).png().toFile(path.join(root, 'resources', 'trayTemplate.png'));     // macOS @1x
await sharp(Buffer.from(glyph)).resize(36, 36).png().toFile(path.join(root, 'resources', 'trayTemplate@2x.png'));  // macOS @2x
console.log('Icons written: build/icon.png (1024), resources/tray.png, resources/trayTemplate(@2x).png');
