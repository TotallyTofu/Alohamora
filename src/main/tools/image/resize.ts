import { withDefaults, type ImageResizeOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { imageSize, loadImage, sameImageFmt, saveImageAs } from '../../engines/image';
import type { ToolRunFn } from '../index';

export const runImageResize: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageResizeOptions>('image.resize', options);
  const size = await imageSize(file);
  let width: number | undefined;
  let height: number | undefined;
  let fit: 'inside' | 'fill' = 'inside';
  if (o.mode === 'percent') {
    if (!(o.percent > 0)) throw new UserError('Choose a size above 0 %.');
    width = Math.max(1, Math.round((size.width * o.percent) / 100));
    height = Math.max(1, Math.round((size.height * o.percent) / 100));
  } else {
    width = o.width > 0 ? Math.round(o.width) : undefined;
    height = o.height > 0 ? Math.round(o.height) : undefined;
    if (!width && !height) throw new UserError('Enter a width or a height.');
    if (!o.keepAspect && width && height) fit = 'fill';
  }
  const img = (await loadImage(file)).resize({ width, height, fit, withoutEnlargement: false });
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(img, fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'resized' }), Math.max(ctx.settings.imageQuality, 90), ctx);
  ctx.note(`${size.width}×${size.height} → ${width ?? '?'}×${height ?? '?'}`);
};
