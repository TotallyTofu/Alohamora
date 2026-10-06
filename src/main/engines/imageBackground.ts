import sharp from 'sharp';
import type { OverlayOptions, Sharp } from 'sharp';
import type { ImageBackgroundOptions } from '@shared/toolOptions';

const RATIO: Record<string, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9, '9:16': 9 / 16 };

function gradientSvg(w: number, h: number, [c1, c2]: [string, string], angle: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>`
    + `<linearGradient id="g" gradientTransform="rotate(${angle - 90} .5 .5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
    + `</defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
}
export function roundedMask(w: number, h: number, r: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
}
function shadowSvg(W: number, H: number, x: number, y: number, w: number, h: number, r: number): Buffer {
  const blur = Math.max(6, Math.round(Math.min(w, h) * 0.03));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${x}" y="${y + blur}" width="${w}" height="${h}" rx="${r}" fill="rgba(0,0,0,0.35)" filter="url(#s)"/></svg>`);
}

/** `src` must already be materialized (raw/PNG) at the size you want. */
export async function composeBackground(src: Sharp, o: ImageBackgroundOptions): Promise<Sharp> {
  const fgPng = await src.clone().ensureAlpha().png().toBuffer();
  const meta = await sharp(fgPng).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const pad = Math.round(Math.max(w, h) * o.paddingPct / 100);
  let W = w + 2 * pad;
  let H = h + 2 * pad;
  const ratio = RATIO[o.aspect];
  if (ratio) { if (W / H > ratio) H = Math.round(W / ratio); else W = Math.round(H * ratio); }
  const radius = Math.round(Math.min(w, h) * o.radiusPct / 100);
  const fg = radius > 0 ? await sharp(fgPng).composite([{ input: roundedMask(w, h, radius), blend: 'dest-in' }]).png().toBuffer() : fgPng;
  let bg: Buffer;
  if (o.kind === 'solid') bg = await sharp({ create: { width: W, height: H, channels: 4, background: o.color } }).png().toBuffer();
  else if (o.kind === 'gradient') bg = await sharp(gradientSvg(W, H, o.gradient, o.angle)).png().toBuffer();
  else bg = await sharp(fgPng).resize(W, H, { fit: 'cover' }).blur(Math.max(20, Math.round(W / 40))).modulate({ brightness: 0.9 }).png().toBuffer();
  const left = Math.round((W - w) / 2);
  const top = Math.round((H - h) / 2);
  const layers: OverlayOptions[] = [];
  if (o.shadow) layers.push({ input: shadowSvg(W, H, left, top, w, h, radius), left: 0, top: 0 });
  layers.push({ input: fg, left, top });
  return sharp(bg).composite(layers);
}
