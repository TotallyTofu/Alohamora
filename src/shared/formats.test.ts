import { describe, expect, it } from 'vitest';
import {
  CONVERT_TARGETS, extOf, fmtFromExt, fmtFromMime, fmtFromPath, needsOptions, outputExt,
  targetAvailable
} from './formats';
import { makeCaps } from './testCaps';

describe('extOf / fmtFrom*', () => {
  it('extOf handles case, missing and leading dots', () => {
    expect(extOf('C:\\x\\Photo.JPEG')).toBe('jpeg');
    expect(extOf('noext')).toBe('');
    expect(extOf('.bashrc')).toBe('');
    expect(extOf('/a/b.c/file.tar.gz')).toBe('gz');
  });

  it('fmtFromPath resolves aliases and rejects non-inputs', () => {
    expect(fmtFromPath('a.jpeg')).toBe('jpg');
    expect(fmtFromPath('a.jfif')).toBe('jpg');
    expect(fmtFromPath('a.tif')).toBe('tiff');
    expect(fmtFromPath('a.heif')).toBe('heic');
    expect(fmtFromPath('a.aif')).toBe('aiff');
    expect(fmtFromPath('a.m4v')).toBe('mp4');
    expect(fmtFromPath('a.aac')).toBe('m4a');
    expect(fmtFromPath('a.md')).toBe('txt');
    expect(fmtFromPath('a.docx')).toBeNull();
    expect(fmtFromPath('a.zip')).toBeNull();
  });

  it('fmtFromExt / fmtFromMime / outputExt', () => {
    expect(fmtFromExt('PNG')).toBe('png');
    expect(fmtFromMime('video/quicktime')).toBe('mov');
    expect(fmtFromMime('image/jpeg')).toBe('jpg');
    expect(fmtFromMime('application/zip')).toBeNull();
    expect(outputExt('jpg')).toBe('jpg');
    expect(outputExt('tiff')).toBe('tiff');
  });
});

describe('targetAvailable', () => {
  it('hides HEIC without an encoder and shows it with one', () => {
    expect(targetAvailable('heic', 'image', makeCaps({ heifEnc: false }))).toBe(false);
    expect(targetAvailable('heic', 'image', makeCaps({ heifEnc: true, heicTool: 'sips' }))).toBe(true);
  });

  it('checks FFmpeg encoders for video/audio targets', () => {
    expect(targetAvailable('webm', 'video', makeCaps({ encoders: ['libvpx-vp9', 'libopus'] }))).toBe(true);
    expect(targetAvailable('webm', 'video', makeCaps({ encoders: [] }))).toBe(false);
    expect(targetAvailable('mp3', 'audio', makeCaps({ ffmpeg: false }))).toBe(false);
  });

  it('sharp-based conversions do not need FFmpeg', () => {
    expect(targetAvailable('png', 'image', makeCaps({ ffmpeg: false }))).toBe(true);
    expect(targetAvailable('bmp', 'image', makeCaps({ ffmpeg: false }))).toBe(false);
  });
});

describe('needsOptions', () => {
  it('flags the card conversions only', () => {
    expect(needsOptions('video', 'gif')).toBe(true);
    expect(needsOptions('video', 'mp4')).toBe(false);
    expect(needsOptions('image', 'svg')).toBe(true);
    expect(needsOptions('pdf', 'docx')).toBe(true);
    expect(needsOptions('epub', 'pdf')).toBe(true);
    expect(needsOptions('text', 'srt')).toBe(true);
    expect(needsOptions('image', 'png')).toBe(false);
  });
});

describe('CONVERT_TARGETS', () => {
  it('never offers a category its own non-convertible formats', () => {
    expect(CONVERT_TARGETS.epub).toEqual(['pdf']);
    expect(CONVERT_TARGETS.image).toContain('docx');
  });
});
