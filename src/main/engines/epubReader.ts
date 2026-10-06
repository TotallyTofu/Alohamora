import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from '../errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Xml = any;

export interface EpubBook { root: string; title: string; spine: string[]; fixedLayout: boolean; coverPath?: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
const arr = (v: Xml): Xml[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v: Xml): string => (typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String(v['#text']) : '');
const cleanHref = (h: string): string => decodeURIComponent(String(h).split('#')[0]);

interface Package { opfDir: string; title: string; spineHrefs: string[]; fixedLayout: boolean; coverHref?: string }

function parsePackage(containerXml: string, readOpf: (rel: string) => string): Package {
  const rootfile = arr(parser.parse(containerXml)?.container?.rootfiles?.rootfile)[0];
  const opfRel: string | undefined = rootfile?.['@_full-path'];
  if (!opfRel) throw new UserError('This EPUB is missing its package file.');
  const opf = parser.parse(readOpf(opfRel))?.package;
  const manifest = new Map<string, { href: string; props: string }>();
  for (const it of arr(opf?.manifest?.item)) manifest.set(it['@_id'], { href: cleanHref(it['@_href']), props: it['@_properties'] ?? '' });
  const spineHrefs = arr(opf?.spine?.itemref).map((r: Xml) => manifest.get(r['@_idref'])?.href).filter((h: string | undefined): h is string => !!h);
  const metas = arr(opf?.metadata?.meta);
  const fixedLayout = metas.some((m: Xml) => m['@_property'] === 'rendition:layout' && textOf(m).trim() === 'pre-paginated');
  const title = textOf(arr(opf?.metadata?.title)[0]).trim();
  const coverId = metas.find((m: Xml) => m['@_name'] === 'cover')?.['@_content'];
  const cover = [...manifest.values()].find((m) => m.props.includes('cover-image')) ?? (coverId ? manifest.get(coverId) : undefined);
  return { opfDir: path.posix.dirname(opfRel), title, spineHrefs, fixedLayout, coverHref: cover?.href };
}

/** Extract to destDir (zip-slip safe) and describe the book. */
export async function extractEpub(epubPath: string, destDir: string): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(epubPath));
  const root = path.resolve(destDir);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(root + path.sep)) continue;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, await entry.async('nodebuffer'));
  }
  const containerPath = path.join(root, 'META-INF', 'container.xml');
  if (!fs.existsSync(containerPath)) throw new UserError('This file is not a valid EPUB.');
  const pkg = parsePackage(fs.readFileSync(containerPath, 'utf8'), (rel) => fs.readFileSync(path.resolve(root, rel), 'utf8'));
  const abs = (href: string): string => path.resolve(root, pkg.opfDir, href);
  return {
    root, title: pkg.title || path.basename(epubPath, path.extname(epubPath)),
    spine: pkg.spineHrefs.map(abs).filter((p) => fs.existsSync(p)),
    fixedLayout: pkg.fixedLayout, coverPath: pkg.coverHref ? abs(pkg.coverHref) : undefined
  };
}

/** Cover image bytes without extracting the whole book (for thumbnails). */
export async function readEpubCover(epubPath: string): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(epubPath));
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) return null;
  const opfFiles: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (name.endsWith('.opf')) opfFiles[name] = await zip.file(name)!.async('string');
  const pkg = parsePackage(container, (rel) => opfFiles[rel] ?? '');
  if (!pkg.coverHref) return null;
  const coverName = path.posix.normalize(path.posix.join(pkg.opfDir, pkg.coverHref));
  return (await zip.file(coverName)?.async('nodebuffer')) ?? null;
}

/** `<meta name="viewport" content="width=1200, height=1600">` from a fixed-layout page. */
export function readViewport(xhtmlPath: string): { width: number; height: number } | null {
  const s = fs.readFileSync(xhtmlPath, 'utf8');
  const m = /name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)/i.exec(s);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}
