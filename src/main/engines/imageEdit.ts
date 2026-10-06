import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { EditSpec } from '@shared/editPipeline';

function vignetteSvg(w: number, h: number, strength: number): Buffer {
  const k = Math.round(255 * (1 - 0.75 * strength));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%">`
    + `<stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="rgb(${k},${k},${k})"/></radialGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#v)"/></svg>`);
}

/** Same function for the preview (proxy) and the final export, so the preview matches the output. */
export function applyEdit(img: Sharp, spec: EditSpec, size: { width: number; height: number }): Sharp {
  let s = img;
  if (spec.linear) s = s.linear(spec.linear[0], spec.linear[1]);
  if (spec.modulate) s = s.modulate({ saturation: spec.modulate.saturation, hue: spec.modulate.hue });
  if (spec.recomb) s = s.recomb(spec.recomb);
  if (spec.grayscale) s = s.grayscale();
  if (spec.negate) s = s.negate({ alpha: false });
  if (spec.sharpenSigma) s = s.sharpen({ sigma: spec.sharpenSigma });
  if (spec.blurSigma) s = s.blur(spec.blurSigma);
  if (spec.vignette > 0) s = s.composite([{ input: vignetteSvg(size.width, size.height, spec.vignette), blend: 'multiply' }]);
  return s;
}
