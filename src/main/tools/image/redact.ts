import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { clampNormRect, toPixelRect } from '@shared/geometry';
import { withDefaults, type ImageRedactOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { loadImage, materialize, sameImageFmt, saveImageAs } from '../../engines/image';
import type { ToolRunFn } from '../index';

export const runImageRedact: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageRedactOptions>('image.redact', options);
  if (o.regions.length === 0) throw new UserError('Draw at least one box over the area to hide.');
  const base = await materialize(await loadImage(file));
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };
  const layers: OverlayOptions[] = [];
  for (const reg of o.regions) {
    const r = toPixelRect(clampNormRect(reg.rect), info.width, info.height);
    const region = sharp(data, { raw }).extract({ left: r.x, top: r.y, width: r.w, height: r.h });
    let input: Buffer;
    if (reg.style === 'black') input = await sharp({ create: { width: r.w, height: r.h, channels: 4, background: '#000000' } }).png().toBuffer();
    else if (reg.style === 'blur') input = await region.blur(Math.max(12, Math.min(r.w, r.h) / 6)).png().toBuffer();
    else {
      const small = await region.resize(Math.max(1, Math.ceil(r.w / 16)), Math.max(1, Math.ceil(r.h / 16)), { kernel: 'nearest' }).png().toBuffer();
      input = await sharp(small).resize(r.w, r.h, { kernel: 'nearest' }).png().toBuffer();
    }
    layers.push({ input, left: r.x, top: r.y });
  }
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(sharp(data, { raw }).composite(layers), fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'redacted' }), 92, ctx, false);
  ctx.note('Metadata removed');
};
