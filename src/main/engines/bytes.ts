/**
 * pdf-lib's JPEG embedder reads `new DataView(bytes.buffer)` and ignores `byteOffset`. Node serves small Buffers (< 4 KB, e.g. the
 * JPEG of a near-blank page) from a shared pool, where the data does not start at offset 0, so embedding fails with
 * "SOI not found in JPEG". A copy owns an exactly-sized ArrayBuffer and is always safe to hand to pdf-lib.
 */
export function ownBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
