import { withDefaults, type ImageBackgroundOptions } from '@shared/toolOptions';
import { composeBackground } from '../../engines/imageBackground';
import { loadImage, materialize, saveRaster } from '../../engines/image';
import type { ToolRunFn } from '../index';

export const runImageBackground: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageBackgroundOptions>('image.background', options);
  const src = await materialize(await loadImage(file));
  const composed = await composeBackground(src, o);
  const fmt = file.fmt === 'jpg' ? 'jpg' : 'png';
  await saveRaster(composed, fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'backdrop' }), Math.max(ctx.settings.imageQuality, 92), false);
};
