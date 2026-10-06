import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { textToBlocks, type Block } from '@shared/pdfReflow';
import { throwIfAborted, UserError } from '../errors';
import type { JobContext } from '../jobs/context';
import { cacheDir, tessdataDir } from '../paths';
import { pdfRenderPage, withPdf } from './pdfEngine';

export function availableLangs(wanted: string[]): string[] {
  return wanted.filter((l) => fs.existsSync(path.join(tessdataDir(), `${l}.traineddata`)));
}

export async function withOcrWorker<T>(langs: string[], fn: (w: Worker) => Promise<T>): Promise<T> {
  const ok = availableLangs(langs.length ? langs : ['eng']);
  if (ok.length === 0) throw new UserError('No OCR language data found. Run "npm run fetch-binaries".');
  const options: Record<string, unknown> = { langPath: tessdataDir(), cachePath: cacheDir('tesseract'), gzip: false, cacheMethod: 'none' };
  if (app.isPackaged) {
    options.workerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
  }
  const worker = await createWorker(ok, 1, options as Parameters<typeof createWorker>[2]);
  try {
    await worker.setParameters({ user_defined_dpi: '300' } as never);
    return await fn(worker);
  } finally {
    await worker.terminate();
  }
}

export async function recognize(worker: Worker, image: Buffer, wantPdf: boolean): Promise<{ text: string; pdf?: Buffer }> {
  const { data } = await worker.recognize(image, {}, { text: true, pdf: wantPdf } as never);
  const d = data as unknown as { text: string; pdf?: number[] | null };
  return { text: d.text ?? '', pdf: wantPdf && d.pdf ? Buffer.from(d.pdf) : undefined };
}

/** OCR every page (or the given pages) of a PDF into text blocks. */
export async function ocrPdfToBlocks(pdfPath: string, ctx: JobContext, pageIndexes?: number[]): Promise<Block[]> {
  const langs = ctx.settings.ocrLanguages;
  return withPdf(pdfPath, (doc) => withOcrWorker(langs, async (worker) => {
    const pages = pageIndexes ?? Array.from({ length: doc.pages }, (_, i) => i);
    const blocks: Block[] = [];
    for (let k = 0; k < pages.length; k++) {
      throwIfAborted(ctx.signal);
      const png = await pdfRenderPage(doc.id, pages[k], { dpi: 300, mime: 'image/png' });
      blocks.push(...textToBlocks((await recognize(worker, png, false)).text));
      if (k < pages.length - 1) blocks.push({ type: 'pagebreak' });
      ctx.progress((k + 1) / pages.length, `Reading page ${pages[k] + 1} of ${doc.pages}`);
    }
    return blocks;
  }));
}

export async function ocrPages(pdfPath: string, ctx: JobContext, langs: string[], pageIndexes: number[], wantPdf: boolean): Promise<{ text: string; pdfs: Buffer[] }> {
  return withPdf(pdfPath, (doc) => withOcrWorker(langs, async (worker) => {
    const texts: string[] = [];
    const pdfs: Buffer[] = [];
    for (let k = 0; k < pageIndexes.length; k++) {
      throwIfAborted(ctx.signal);
      const png = await pdfRenderPage(doc.id, pageIndexes[k], { dpi: 300, mime: 'image/png' });
      const r = await recognize(worker, png, wantPdf);
      texts.push(`--- Page ${pageIndexes[k] + 1} ---\n${r.text.trim()}`);
      if (r.pdf) pdfs.push(r.pdf);
      ctx.progress((k + 1) / pageIndexes.length, `Reading page ${pageIndexes[k] + 1} of ${doc.pages}`);
    }
    return { text: texts.join('\n\n') + '\n', pdfs };
  }));
}
