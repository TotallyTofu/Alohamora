import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { escapeXml } from '@shared/text';
import { CONTAINER_XML, chapterXhtml, fixedPageXhtml, navXhtml, opfXml, STYLE_CSS } from './epubTemplates';

export interface EpubMeta { title: string; author?: string; lang: string }

async function pack(files: Array<{ path: string; data: string | Buffer }>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });   // MUST be first and uncompressed
  zip.file('META-INF/container.xml', CONTAINER_XML);
  for (const f of files) zip.file(f.path, f.data);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function buildReflowEpub(meta: EpubMeta, chapters: Array<{ title: string; bodyXhtml: string }>): Promise<Buffer> {
  const items = chapters.map((c, i) => ({ id: `c${String(i + 1).padStart(3, '0')}`, href: `c${String(i + 1).padStart(3, '0')}.xhtml`, title: c.title, body: c.bodyXhtml }));
  return pack([
    { path: 'OEBPS/style.css', data: STYLE_CSS },
    { path: 'OEBPS/nav.xhtml', data: navXhtml(meta.title, items) },
    ...items.map((it) => ({ path: `OEBPS/${it.href}`, data: chapterXhtml(it.title, it.body, meta.lang) })),
    { path: 'OEBPS/content.opf', data: opfXml({ ...meta, id: randomUUID(), fixed: false, items: items.map((i) => ({ id: i.id, href: i.href, type: 'application/xhtml+xml' })), images: [] }) }
  ]);
}

export async function buildFixedEpub(meta: EpubMeta, pages: Array<{ jpeg: Buffer; width: number; height: number }>): Promise<Buffer> {
  const items = pages.map((p, i) => {
    const n = String(i + 1).padStart(3, '0');
    return { id: `p${n}`, href: `p${n}.xhtml`, img: `images/p${n}.jpg`, title: `Page ${i + 1}`, ...p };
  });
  return pack([
    { path: 'OEBPS/nav.xhtml', data: navXhtml(meta.title, items) },
    ...items.map((it) => ({ path: `OEBPS/${it.img}`, data: it.jpeg })),
    ...items.map((it) => ({ path: `OEBPS/${it.href}`, data: fixedPageXhtml(it.title, it.img, it.width, it.height) })),
    { path: 'OEBPS/content.opf', data: opfXml({
      ...meta, id: randomUUID(), fixed: true,
      items: items.map((i) => ({ id: i.id, href: i.href, type: 'application/xhtml+xml' })),
      images: items.map((i) => ({ id: `${i.id}-img`, href: i.img, type: 'image/jpeg' }))
    }) }
  ]);
}

export { escapeXml };
