import { clampNormRect, isFullRect, toPixelRect } from '@shared/geometry';
import { withDefaults, type ImageCropOptions } from '@shared/toolOptions';
import { loadImage, materialize, sameImageFmt, saveImageAs } from '../../engines/image';
import type { ToolRunFn } from '../index';

export const runImageCrop: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageCropOptions>('image.crop', options);
  let img = await materialize(await loadImage(file));           // auto-orient baked in
  if (o.rotate) img = img.rotate(o.rotate);
  if (o.flipV) img = img.flip();
  if (o.flipH) img = img.flop();
  img = await materialize(img);                                  // rotation baked in, so extract uses rotated coords
  const meta = await img.metadata();
  const r = toPixelRect(clampNormRect(o.rect), meta.width ?? 0, meta.height ?? 0);
  if (!isFullRect(o.rect)) img = img.extract({ left: r.x, top: r.y, width: r.w, height: r.h });
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(img, fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'cropped' }), Math.max(ctx.settings.imageQuality, 92), ctx);
};
