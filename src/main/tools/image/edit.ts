import { buildEditSpec } from '@shared/editPipeline';
import { withDefaults, type EditParams } from '@shared/toolOptions';
import { applyEdit } from '../../engines/imageEdit';
import { loadImage, materialize, sameImageFmt, saveImageAs } from '../../engines/image';
import type { ToolRunFn } from '../index';

export const runImageEdit: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<EditParams>('image.edit', options);
  const base = await materialize(await loadImage(file));
  const meta = await base.metadata();
  const edited = applyEdit(base, buildEditSpec(o), { width: meta.width ?? 1, height: meta.height ?? 1 });
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(edited, fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'edited' }), Math.max(ctx.settings.imageQuality, 92), ctx);
};
