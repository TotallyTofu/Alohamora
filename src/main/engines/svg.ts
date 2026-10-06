import fs from 'node:fs';
import ImageTracer from 'imagetracerjs';
import type { Sharp } from 'sharp';

export async function embedAsSvg(img: Sharp, out: string): Promise<void> {
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}">`
    + `<image width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/></svg>`;
  await fs.promises.writeFile(out, svg, 'utf8');
}

/** Vectorize: downscale to ≤1000 px, quantize to `colors`, trace paths. */
export async function traceToSvg(img: Sharp, out: string, colors: number): Promise<void> {
  const { data, info } = await img.resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgd = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
  let svg = ImageTracer.imagedataToSVG(imgd, {
    numberofcolors: colors, pathomit: 8, ltres: 1, qtres: 1, colorquantcycles: 3, strokewidth: 0,
    linefilter: true, roundcoords: 1, viewbox: true, desc: false
  });
  if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg ', `<svg width="${info.width}" height="${info.height}" `);
  await fs.promises.writeFile(out, svg, 'utf8');
}
