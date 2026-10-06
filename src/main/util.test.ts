import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mapLimit, moveFile, removeOlderThan } from './util';

const made: string[] = [];
const tmp = (): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-util-')); made.push(d); return d; };
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('removeOlderThan', () => {
  it('removes only entries older than the limit and reports the count', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'old.bin'), 'x');
    fs.mkdirSync(path.join(dir, 'old-folder'));
    fs.writeFileSync(path.join(dir, 'old-folder', 'inner.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'new.bin'), 'x');
    const longAgo = new Date(Date.now() - 10 * 86_400_000);
    fs.utimesSync(path.join(dir, 'old.bin'), longAgo, longAgo);
    fs.utimesSync(path.join(dir, 'old-folder'), longAgo, longAgo);
    expect(await removeOlderThan(dir, 7 * 86_400_000)).toBe(2);
    expect(fs.readdirSync(dir)).toEqual(['new.bin']);
  });

  it('a missing folder is not an error', async () => {
    expect(await removeOlderThan(path.join(os.tmpdir(), 'kb-does-not-exist-123'), 1000)).toBe(0);
  });
});

describe('mapLimit / moveFile', () => {
  it('keeps order and never exceeds the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('moveFile never overwrites', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
    await expect(moveFile(path.join(dir, 'a.txt'), path.join(dir, 'b.txt'))).rejects.toThrow(/exists/);
    await moveFile(path.join(dir, 'a.txt'), path.join(dir, 'c.txt'));
    expect(fs.readFileSync(path.join(dir, 'c.txt'), 'utf8')).toBe('a');
    expect(fs.existsSync(path.join(dir, 'a.txt'))).toBe(false);
  });
});
