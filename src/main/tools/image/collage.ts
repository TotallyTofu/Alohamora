import { withDefaults, type CollageOptions } from '@shared/toolOptions';
import { composeCollage } from '../../engines/imageCollage';
import type { ToolRunFn } from '../index';
import { orderFiles } from '../video/join';

export const runImageCollage: ToolRunFn = async (files, options, ctx) => {
  const o = withDefaults<CollageOptions>('image.collage', options);
  const ordered = orderFiles(files, o.order);
  const collage = await composeCollage(ordered, o, o.width, ctx.signal);
  const out = ctx.newOutput({ source: ordered[0].path, ext: 'jpg', suffix: 'collage' });
  await collage.flatten({ background: o.background }).jpeg({ quality: 90, mozjpeg: true }).toFile(out);
  ctx.note(`${ordered.length} images`);
};
