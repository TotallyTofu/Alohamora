import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  groupFileName, groupFolderName, outputFileName, resolveCollision, sanitizeFileName, splitName, withCounter
} from './naming';

describe('naming', () => {
  it('splitName', () => {
    expect(splitName('a.b.mp4')).toEqual({ base: 'a.b', ext: 'mp4' });
    expect(splitName('.bashrc')).toEqual({ base: '.bashrc', ext: '' });
    expect(splitName('README')).toEqual({ base: 'README', ext: '' });
  });

  it('outputFileName with and without suffix', () => {
    expect(outputFileName('clip', 'mp4', 'trimmed')).toBe('clip-trimmed.mp4');
    expect(outputFileName('photo', 'jpg')).toBe('photo.jpg');
    expect(outputFileName('photo', 'jpg', '')).toBe('photo.jpg');
  });

  it('groupFolderName / groupFileName pad to at least 3 digits', () => {
    expect(groupFolderName('report', 'pages')).toBe('report-pages');
    expect(groupFileName('report', 3, 120, 'jpg')).toBe('report-003.jpg');
    expect(groupFileName('report', 7, 12345, 'jpg')).toBe('report-00007.jpg');
  });

  it('withCounter', () => {
    expect(withCounter('a.jpg', 2)).toBe('a (2).jpg');
    expect(withCounter('folder', 1)).toBe('folder (1)');
  });

  it('resolveCollision walks name, (1), (2)…', () => {
    const taken = new Set([path.win32.join('C:\\out', 'a.jpg'), path.win32.join('C:\\out', 'a (1).jpg')]);
    const got = resolveCollision('C:\\out', 'a.jpg', (p) => taken.has(p), path.win32.join);
    expect(got).toBe(path.win32.join('C:\\out', 'a (2).jpg'));
    expect(resolveCollision('C:\\out', 'b.jpg', (p) => taken.has(p), path.win32.join)).toBe(path.win32.join('C:\\out', 'b.jpg'));
  });

  it('resolveCollision gives up after 9999 attempts', () => {
    expect(() => resolveCollision('/o', 'a.jpg', () => true, path.posix.join)).toThrow();
  });

  it('sanitizeFileName', () => {
    expect(sanitizeFileName('a<b>:c"d/e\\f|g?h*i')).toBe('a_b__c_d_e_f_g_h_i');
    expect(sanitizeFileName('name. ')).toBe('name');
    expect(sanitizeFileName('   ')).toBe('output');
    const long = sanitizeFileName(`${'x'.repeat(300)}.png`);
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith('.png')).toBe(true);
  });
});
