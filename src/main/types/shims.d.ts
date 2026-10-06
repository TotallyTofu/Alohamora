declare module 'heic-decode' {
  interface Decoded { width: number; height: number; data: Uint8ClampedArray }
  function decode(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<Decoded>;
  export default decode;
}
declare module 'imagetracerjs' {
  const ImageTracer: {
    imagedataToSVG(imgd: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, unknown> | string): string;
  };
  export default ImageTracer;
}
declare module 'piexifjs' {
  const piexif: {
    load(binary: string): Record<string, Record<number, unknown>>;
    dump(exif: Record<string, unknown>): string;
    insert(exifBytes: string, binary: string): string;
    remove(binary: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
  };
  export default piexif;
}
