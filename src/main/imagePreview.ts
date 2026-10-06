import { ipcMain } from 'electron';
import sharp from 'sharp';
import type { Sharp } from 'sharp';
import fs from 'node:fs';
import { buildEditSpec } from '@shared/editPipeline';
import { IPC } from '@shared/ipc';
import {
  DEFAULT_EDIT, TOOL_DEFAULTS, withDefaults, type CollageOptions, type EditParams, type ImageBackgroundOptions, type ImageCompressOptions,
  type ImageCropOptions
} from '@shared/toolOptions';
import type { ImagePreviewRequest, ImagePreviewResult } from '@shared/types';
import { inspectBasic } from './inspect';
import { loadImage, materialize } from './engines/image';
import { composeBackground } from './engines/imageBackground';
import { composeCollage } from './engines/imageCollage';
import { applyEdit } from './engines/imageEdit';
import { compressImageTo } from './tools/image/compress';

const proxyCache = new Map<string, { data: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 }>();

/** Decoded, auto-oriented, downscaled raw pixels (cached, max 6 entries). */
export async function proxy(path: string, maxSide: number): Promise<Sharp> {
  const key = `${path}|${maxSide}`;
  let hit = proxyCache.get(key);
  if (!hit) {
    const { data, info } = await (await loadImage(inspectBasic(path), { density: 144 }))
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    hit = { data, width: info.width, height: info.height, channels: info.channels };
    if (proxyCache.size >= 6) proxyCache.delete(proxyCache.keys().next().value as string);
    proxyCache.set(key, hit);
  }
  return sharp(hit.data, { raw: { width: hit.width, height: hit.height, channels: hit.channels } });
}

async function toResult(img: Sharp, extra: Partial<ImagePreviewResult> = {}): Promise<ImagePreviewResult> {
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  return { dataUrl: `data:image/png;base64,${data.toString('base64')}`, width: info.width, height: info.height, ...extra };
}

export async function previewImage(req: ImagePreviewRequest): Promise<ImagePreviewResult> {
  const base = await proxy(req.path, req.maxSide);
  switch (req.op) {
    case 'none': return toResult(base);
    case 'compress': {
      const o = withDefaults<ImageCompressOptions>('image.compress', req.options);
      const { buffer } = await compressImageTo(inspectBasic(req.path), o, null);      // full resolution → the real size
      const originalBytes = (await fs.promises.stat(req.path)).size;
      const shown = sharp(buffer).resize({ width: req.maxSide, height: req.maxSide, fit: 'inside', withoutEnlargement: true });
      return toResult(shown, { bytes: buffer.length, originalBytes });
    }
    case 'crop': {
      const o = withDefaults<ImageCropOptions>('image.crop', req.options);
      let img = await materialize(base);
      if (o.rotate) img = img.rotate(o.rotate);
      if (o.flipV) img = img.flip();
      if (o.flipH) img = img.flop();
      return toResult(await materialize(img));
    }
    case 'edit': {
      const params = { ...DEFAULT_EDIT, ...(req.options ?? {}) } as EditParams;
      const meta = await base.clone().metadata();
      return toResult(applyEdit(base, buildEditSpec(params), { width: meta.width ?? 1, height: meta.height ?? 1 }));
    }
    case 'background': {
      const o = withDefaults<ImageBackgroundOptions>('image.background', req.options);
      return toResult(await composeBackground(base, o));
    }
    case 'collage': {
      const o = withDefaults<CollageOptions>('image.collage', req.options);
      const paths = req.paths && req.paths.length ? req.paths : [req.path];
      const ordered = o.order.length ? o.order.filter((p) => paths.includes(p)) : paths;
      return toResult(await composeCollage(ordered.map((p) => inspectBasic(p)), o, 800));
    }
    default: return toResult(base);
  }
}

export function registerImagePreviewIpc(): void {
  ipcMain.handle(IPC.previewImage, (_e, req: ImagePreviewRequest) => previewImage(req));
}
