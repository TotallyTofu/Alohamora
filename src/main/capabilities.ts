import { app } from 'electron';
import fs from 'node:fs';
import type { Capabilities, Platform } from '@shared/types';
import { runProcess } from './engines/process';
import { parseEncoderList } from './engines/ffmpegParse';
import { ffmpegPath, findOnPath, heifEncPath, isLinux, isMac, macDragHelperPath, tessdataDir } from './paths';
import { log } from './log';

const empty = (): Capabilities => ({
  platform: process.platform as Platform, arch: process.arch, appVersion: app.getVersion(),
  ffmpeg: false, ffmpegVersion: '', encoders: [], heifEnc: false, heicTool: null, hwVideo: null,
  globalDrag: 'unavailable', ocrLanguages: []
});

let caps: Capabilities = empty();
let heicToolPath: string | null = null;

/** Where the HEIC encoder lives (used by engines/heif.ts). */
export function getHeicTool(): { kind: 'sips' | 'heif-enc'; path: string } | null {
  return caps.heicTool && heicToolPath ? { kind: caps.heicTool, path: heicToolPath } : null;
}

function detectHeic(next: Capabilities): void {
  if (isMac && fs.existsSync('/usr/bin/sips')) { next.heicTool = 'sips'; heicToolPath = '/usr/bin/sips'; }
  else if (fs.existsSync(heifEncPath())) { next.heicTool = 'heif-enc'; heicToolPath = heifEncPath(); }
  else if (isLinux) { const p = findOnPath('heif-enc'); if (p) { next.heicTool = 'heif-enc'; heicToolPath = p; } }
  next.heifEnc = next.heicTool !== null;
}

function detectGlobalDrag(): Capabilities['globalDrag'] {
  if (isMac) return fs.existsSync(macDragHelperPath()) ? 'mac-helper' : 'unavailable';
  if (isLinux) {
    const wayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
    return wayland ? 'unavailable' : 'hook';        // global hooks are impossible on Wayland
  }
  return 'hook';
}

export async function detectCapabilities(): Promise<Capabilities> {
  const next = empty();
  try {
    const enc = await runProcess(ffmpegPath(), ['-hide_banner', '-encoders'], { name: 'FFmpeg' });
    next.encoders = parseEncoderList(enc.stdout.toString());
    const ver = await runProcess(ffmpegPath(), ['-version'], { name: 'FFmpeg' });
    next.ffmpegVersion = ver.stdout.toString().split(/\r?\n/)[0] ?? '';
    next.ffmpeg = next.encoders.length > 0;
  } catch (e) {
    log.error('FFmpeg is not available', e);
  }
  detectHeic(next);
  next.globalDrag = detectGlobalDrag();
  try {
    next.ocrLanguages = fs.readdirSync(tessdataDir()).filter((f) => f.endsWith('.traineddata')).map((f) => f.replace(/\.traineddata$/, ''));
  } catch {
    next.ocrLanguages = [];
  }
  next.hwVideo = caps.hwVideo;          // filled later by detectHardwareVideo() (Task 12.7)
  caps = next;
  log.info('Capabilities', { platform: `${caps.platform}-${caps.arch}`, ffmpeg: caps.ffmpeg, version: caps.ffmpegVersion,
    encoders: caps.encoders.length, heic: caps.heicTool, globalDrag: caps.globalDrag, ocr: caps.ocrLanguages });
  return caps;
}

/** Used by Task 12.7 after it test-encodes a frame. */
export function setHardwareVideo(encoder: string | null): void {
  caps = { ...caps, hwVideo: encoder };
}

export function getCapabilities(): Capabilities {
  return caps;
}
