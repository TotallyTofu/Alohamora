import { describe, expect, it } from 'vitest';
import { stripJpegMetadata, stripPngMetadata } from './imageMeta';

const bytes = (...parts: Array<number[] | string | Uint8Array>): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : Array.from(p))));
const hasMarker = (b: Uint8Array, hi: number, lo: number): boolean => b.some((v, i) => v === hi && b[i + 1] === lo);
const text = (b: Uint8Array): string => String.fromCharCode(...b);

describe('stripJpegMetadata', () => {
  // SOI, APP0 "JFIF", APP1 "Exif", COM "hi!", SOS + data, EOI
  const jpeg = bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, 0x00, 0x10], 'JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xe1, 0x00, 0x08], 'Exif', [0, 0],
    [0xff, 0xfe, 0x00, 0x05], 'hi!',
    [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33],
    [0xff, 0xd9]
  );

  it('drops APP1 (EXIF) and comments but keeps JFIF and the image data', () => {
    const out = stripJpegMetadata(jpeg);
    expect(hasMarker(out, 0xff, 0xe0)).toBe(true);
    expect(hasMarker(out, 0xff, 0xe1)).toBe(false);
    expect(hasMarker(out, 0xff, 0xfe)).toBe(false);
    expect(text(out)).toContain('JFIF');
    expect(text(out)).not.toContain('Exif');
    expect(out.slice(-2)).toEqual(Uint8Array.from([0xff, 0xd9]));
  });

  it('rejects data that is not a JPEG', () => {
    expect(() => stripJpegMetadata(bytes('PNG....'))).toThrow('Not a JPEG');
  });
});

describe('stripPngMetadata', () => {
  const chunk = (type: string, data: number[]): Uint8Array =>
    bytes([0, 0, 0, data.length], type, data, [0, 0, 0, 0]);   // CRC is not checked by the stripper
  const png = bytes([137, 80, 78, 71, 13, 10, 26, 10], chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    chunk('tEXt', [75, 0, 118]), chunk('IDAT', [1, 2, 3]), chunk('IEND', []));

  it('removes text chunks and keeps IDAT intact', () => {
    const out = stripPngMetadata(png);
    expect(text(out)).not.toContain('tEXt');
    expect(text(out)).toContain('IHDR');
    expect(text(out)).toContain('IDAT');
    expect(text(out)).toContain('IEND');
    expect(out.length).toBeLessThan(png.length);
  });

  it('rejects data that is not a PNG', () => {
    expect(() => stripPngMetadata(bytes([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow('Not a PNG');
  });
});
