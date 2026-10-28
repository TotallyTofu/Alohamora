import { describe, expect, it } from 'vitest';
import { baseName } from './format';

describe('baseName', () => {
  it('works with Windows and POSIX separators', () => {
    expect(baseName('C:\\Users\\me\\clip.mp4')).toBe('clip.mp4');
    expect(baseName('/home/me/photo.jpg')).toBe('photo.jpg');
    expect(baseName('mixed/dir\\file.txt')).toBe('file.txt');
    expect(baseName('plain.txt')).toBe('plain.txt');
    expect(baseName('/trailing/')).toBe('');
  });
});
