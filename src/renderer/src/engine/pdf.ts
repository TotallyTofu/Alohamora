import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem, TextPage } from '@shared/pdfReflow';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
const docs = new Map<string, Doc>();
const asset = (sub: string): string => new URL(`./pdfjs/${sub}/`, window.location.href).toString();

async function open(p: { data: Uint8Array }): Promise<{ id: string; pages: number; sizes: Array<{ width: number; height: number }> }> {
  const params: Record<string, unknown> = {
    data: p.data, cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'), iccUrl: asset('iccs'), isEvalSupported: false, fontExtraProperties: true
  };
  const doc = await pdfjs.getDocument(params as never).promise;
  const id = crypto.randomUUID();
  docs.set(id, doc);
  const sizes: Array<{ width: number; height: number }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v = page.getViewport({ scale: 1 });
    sizes.push({ width: v.width, height: v.height });
  }
  return { id, pages: doc.numPages, sizes };
}

function get(id: string): Doc {
  const d = docs.get(id);
  if (!d) throw new Error('PDF is not open');
  return d;
}

async function close(p: { id: string }): Promise<void> {
  const d = docs.get(p.id);
  docs.delete(p.id);
  await d?.loadingTask.destroy();   // pdf.js v6: the document proxy has no destroy(); its loading task does
}

async function renderToCanvas(doc: Doc, pageIndex: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  let s = scale;
  const v0 = page.getViewport({ scale: s });
  const MAX = 120_000_000;                                   // pixel cap (Chromium canvas limit is ~268 MP)
  if (v0.width * v0.height > MAX) s *= Math.sqrt(MAX / (v0.width * v0.height));
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  page.cleanup();
  return canvas;
}

async function renderPage(p: { id: string; pageIndex: number; dpi: number; mime: 'image/png' | 'image/jpeg'; quality?: number }): Promise<Uint8Array> {
  const canvas = await renderToCanvas(get(p.id), p.pageIndex, p.dpi / 72);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed'))), p.mime, p.quality ?? 0.92));
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function thumbnails(p: { id: string; maxWidth: number; maxPages?: number }): Promise<string[]> {
  const doc = get(p.id);
  const out: string[] = [];
  const n = Math.min(doc.numPages, p.maxPages ?? 500);
  for (let i = 0; i < n; i++) {
    const page = await doc.getPage(i + 1);
    const w = page.getViewport({ scale: 1 }).width;
    page.cleanup();
    const c = await renderToCanvas(doc, i, p.maxWidth / w);
    out.push(c.toDataURL('image/jpeg', 0.75));
    c.width = 0;
    c.height = 0;
  }
  return out;
}

async function extractText(p: { id: string }): Promise<TextPage[]> {
  const doc = get(p.id);
  const pages: TextPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    await page.getOperatorList();                 // loads fonts so real font names are known
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of tc.items) {
      if (!('str' in raw)) continue;
      const tx = pdfjs.Util.transform(vp.transform, raw.transform);
      const fontSize = Math.hypot(tx[2], tx[3]);
      let fontName = '';
      try { fontName = String((page.commonObjs.get(raw.fontName) as { name?: string } | undefined)?.name ?? ''); } catch { fontName = ''; }
      if (!fontName) fontName = tc.styles[raw.fontName]?.fontFamily ?? '';
      items.push({
        str: raw.str, x: tx[4], y: tx[5], w: raw.width, h: raw.height || fontSize, fontSize,
        bold: /bold|black|heavy|semibold|demi/i.test(fontName), italic: /italic|oblique/i.test(fontName)
      });
    }
    pages.push({ width: vp.width, height: vp.height, items });
    page.cleanup();
  }
  return pages;
}

export const PDF_HANDLERS = {
  'pdf.open': open, 'pdf.close': close, 'pdf.renderPage': renderPage, 'pdf.thumbnails': thumbnails, 'pdf.extractText': extractText
};
