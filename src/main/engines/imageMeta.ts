function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && start + i < buf.length; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}

/** Lossless: drop EXIF/XMP (APP1), IPTC (APP13), comments and other APPn segments. Keeps JFIF, Adobe and (optionally) ICC. */
export function stripJpegMetadata(buf: Uint8Array, keepIcc = true): Uint8Array {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a JPEG file');
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new Error('Corrupt JPEG');
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xda || marker === 0xd9) { parts.push(buf.subarray(i)); return concat(parts); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const seg = buf.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = marker === 0xfe ? false
      : !isApp ? true
      : marker === 0xe0 || marker === 0xee || (marker === 0xe2 && keepIcc && ascii(seg, 4, 12) === 'ICC_PROFILE\0');
    if (keep) parts.push(seg);
    i += 2 + len;
  }
  return concat(parts);
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Lossless: drop text/EXIF/time chunks from a PNG. */
export function stripPngMetadata(buf: Uint8Array): Uint8Array {
  for (let k = 0; k < 8; k++) if (buf[k] !== PNG_SIG[k]) throw new Error('Not a PNG file');
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf[i] * 0x1000000 + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];
    const type = ascii(buf, i + 4, 4);
    const end = i + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}
