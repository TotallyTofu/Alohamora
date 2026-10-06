import fs from 'node:fs';
import path from 'node:path';

/** Run `fn` over items with at most `limit` in flight. Keeps order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Move a file; falls back to copy+delete across drives. Never overwrites. */
export async function moveFile(src: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) throw new Error(`Destination exists: ${dest}`);
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(src);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Key for comparing paths: Windows and default macOS volumes are case-insensitive, Linux is case-sensitive. */
export function pathKey(p: string): string {
  const abs = path.resolve(p);
  return process.platform === 'linux' ? abs : abs.toLowerCase();
}
