import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { rendererDir } from './paths';
import { pathKey } from './util';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: kfile:",
  "media-src 'self' blob: kfile:",
  "font-src 'self' data:",
  "connect-src 'self' kfile: data: blob:",
  "worker-src 'self' blob:"
].join('; ');

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', wasm: 'application/wasm',
  bcmap: 'application/octet-stream', pfb: 'application/octet-stream', icc: 'application/octet-stream',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', pdf: 'application/pdf'
};
const mimeFor = (p: string): string => MIME[path.extname(p).slice(1).toLowerCase()] ?? 'application/octet-stream';

/** MUST be called before app 'ready'. Register both schemes in ONE call. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'kfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
  ]);
}

// ---- kfile allow-list ----
const allowed = new Set<string>();

/** Allow the renderer to load this local file and return its kfile:// URL. */
export function allowFile(filePath: string): string {
  const abs = path.resolve(filePath);
  allowed.add(pathKey(abs));
  return `kfile://local/${encodeURIComponent(abs)}`;
}

async function handleApp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const root = rendererDir();
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return new Response('Forbidden', { status: 403 });
  try {
    const data = await fs.promises.readFile(full);
    const headers: Record<string, string> = { 'Content-Type': mimeFor(full) };
    if (full.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function handleKfile(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filePath = path.resolve(decodeURIComponent(url.pathname.slice(1)));
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length' };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  }
  if (!allowed.has(pathKey(filePath))) return new Response('Forbidden', { status: 403 });
  let size: number;
  try { size = (await fs.promises.stat(filePath)).size; } catch { return new Response('Not found', { status: 404 }); }
  const type = mimeFor(filePath);
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...cors, 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' }
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...cors, 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
}

/** Call after app 'ready'. */
export function registerProtocolHandlers(): void {
  protocol.handle('app', handleApp);
  protocol.handle('kfile', handleKfile);
}
