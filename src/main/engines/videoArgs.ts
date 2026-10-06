import type { PixelRect } from '@shared/geometry';
import type { VideoCompressOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { EVEN_SCALE, hwH264Args, videoEncodeArgs, videoFilter, type MediaFacts, type Quality } from './ffmpegArgs';

const t3 = (s: number): string => s.toFixed(3);
const faststart = (fmt: Fmt): string[] => (fmt === 'mp4' || fmt === 'mov' ? ['-movflags', '+faststart'] : []);
const audioMap = (fmt: Fmt): string[] => (fmt === 'gif' ? [] : ['-map', '0:a:0?']);

export const PRESET_CRF = { high: 20, balanced: 24, small: 28 } as const;

/** New size with the SHORT side capped at maxShort (even numbers); null = unchanged. */
export function capSize(w: number, h: number, maxShort: number): { width: number; height: number } | null {
  if (!maxShort || Math.min(w, h) <= maxShort) return null;
  const k = maxShort / Math.min(w, h);
  const even = (n: number): number => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** kbit/s for the video stream so that the whole file is ≈ targetMb. */
export function targetVideoKbps(targetMb: number, durationSec: number, audioKbps: number): number {
  return Math.floor((targetMb * 8192) / Math.max(1, durationSec) - audioKbps);
}

/** One or two FFmpeg runs (two = target-size two-pass). */
export function compressPlan(input: string, output: string, f: MediaFacts, o: VideoCompressOptions, outFmt: 'mp4' | 'webm', passLog: string, hw: string | null = null): string[][] {
  const size = f.width && f.height ? capSize(f.width, f.height, o.maxHeight) : null;
  const vf = [...(size ? [`scale=${size.width}:${size.height}`] : []), EVEN_SCALE].join(',');
  const base = ['-i', input, '-map', '0:v:0', '-vf', vf];
  const webm = outFmt === 'webm';
  const audio = f.hasAudio ? ['-map', '0:a:0', ...(webm ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k'])] : ['-an'];
  const tail = webm ? [] : ['-movflags', '+faststart'];
  if (o.targetSizeMb > 0) {
    const kbps = targetVideoKbps(o.targetSizeMb, f.durationSec, f.hasAudio ? (webm ? 96 : 128) : 0);
    const v = webm
      ? ['-c:v', 'libvpx-vp9', '-b:v', `${kbps}k`, '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-pix_fmt', 'yuv420p'];
    return [
      [...base, ...v, '-pass', '1', '-passlogfile', passLog, '-an', '-f', 'null', '-'],
      [...base, ...v, '-pass', '2', '-passlogfile', passLog, ...audio, ...tail, output]
    ];
  }
  const h265 = !webm && o.codec === 'h265';
  const v = webm
    ? ['-c:v', 'libvpx-vp9', '-crf', String(PRESET_CRF[o.preset] + 9), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p']
    : hw && !h265
      ? hwH264Args(hw, PRESET_CRF[o.preset])           // hardware only in quality mode (no classic two-pass)
      : ['-c:v', h265 ? 'libx265' : 'libx264', '-preset', 'medium', '-crf', String(PRESET_CRF[o.preset] + (h265 ? 4 : 0)), '-pix_fmt', 'yuv420p', ...(h265 ? ['-tag:v', 'hvc1'] : [])];
  return [[...base, ...v, ...audio, ...tail, output]];
}

export function trimArgs(input: string, output: string, f: MediaFacts, start: number, end: number, precise: boolean, fmt: Fmt, q: Quality, hw: string | null = null): string[] {
  const dur = Math.max(0.05, end - start);
  if (!precise && fmt !== 'gif') {
    return ['-ss', t3(start), '-i', input, '-t', t3(dur), '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', ...faststart(fmt), output];
  }
  return ['-ss', t3(start), '-i', input, '-t', t3(dur), '-map', '0:v:0', ...audioMap(fmt), '-vf', videoFilter(fmt, [], { width: 0, fps: Math.round(f.fps || 12) }), ...videoEncodeArgs(fmt, q, f, 'encode', hw), output];
}

export function cropArgs(input: string, output: string, f: MediaFacts, r: PixelRect, fmt: Fmt, q: Quality, hw: string | null = null): string[] {
  return ['-i', input, '-map', '0:v:0', ...audioMap(fmt), '-vf', videoFilter(fmt, [`crop=${r.w}:${r.h}:${r.x}:${r.y}`], { width: 0, fps: Math.round(f.fps || 12) }),
    ...videoEncodeArgs(fmt, q, f, 'copy', hw), output];
}

export function atempoChain(factor: number): string {
  const parts: string[] = [];
  let r = factor;
  while (r > 2) { parts.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(',');
}

export function speedArgs(input: string, output: string, f: MediaFacts, factor: number, keepAudio: boolean, fmt: Fmt, q: Quality, hw: string | null = null): string[] {
  const vf = videoFilter(fmt, [`setpts=PTS/${factor.toFixed(4)}`], { width: 0, fps: Math.round(f.fps || 12) });
  if (!(keepAudio && f.hasAudio && fmt !== 'gif')) {
    return ['-i', input, '-map', '0:v:0', '-vf', vf, ...videoEncodeArgs(fmt, q, f, 'none', hw), output];
  }
  return ['-i', input, '-filter_complex', `[0:v:0]${vf}[v];[0:a:0]${atempoChain(factor)}[a]`, '-map', '[v]', '-map', '[a]', ...videoEncodeArgs(fmt, q, f, 'encode', hw), output];
}

export function muteArgs(input: string, output: string, fmt: Fmt): string[] {
  return ['-i', input, '-map', '0:v', '-c', 'copy', '-an', ...faststart(fmt), output];
}

export function snapshotArgs(input: string, output: string, t: number, fmt: 'png' | 'jpg'): string[] {
  return ['-ss', t3(Math.max(0, t)), '-i', input, '-frames:v', '1', ...(fmt === 'jpg' ? ['-q:v', '2'] : []), output];
}

export function framesEveryArgs(input: string, pattern: string, everySec: number, fmt: 'png' | 'jpg'): string[] {
  return ['-i', input, '-vf', `fps=1/${Math.max(0.1, everySec)}`, ...(fmt === 'jpg' ? ['-q:v', '2'] : []), pattern];
}

export interface PixelRegion { rect: PixelRect; style: 'blur' | 'pixelate' | 'black'; startSec?: number; endSec?: number }

/** filter_complex graph applying every region in order; returns the final label. */
export function redactGraph(regions: PixelRegion[]): { graph: string; out: string } {
  const parts: string[] = [];
  let cur = '0:v:0';
  regions.forEach((r, i) => {
    const en = r.startSec !== undefined && r.endSec !== undefined ? `:enable='between(t,${t3(r.startSec)},${t3(r.endSec)})'` : '';
    const { x, y, w, h } = r.rect;
    const out = `v${i}`;
    if (r.style === 'black') {
      parts.push(`[${cur}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@1:t=fill${en}[${out}]`);
    } else {
      const fx = r.style === 'blur'
        ? `gblur=sigma=${Math.max(8, Math.round(Math.min(w, h) / 6))}`
        : `scale=${Math.max(1, Math.round(w / 12))}:${Math.max(1, Math.round(h / 12))}:flags=neighbor,scale=${w}:${h}:flags=neighbor`;
      parts.push(`[${cur}]split=2[b${i}][c${i}]`, `[c${i}]crop=${w}:${h}:${x}:${y},${fx}[r${i}]`, `[b${i}][r${i}]overlay=${x}:${y}${en}[${out}]`);
    }
    cur = out;
  });
  return { graph: parts.join(';'), out: cur };
}

export function redactArgs(input: string, output: string, f: MediaFacts, regions: PixelRegion[], fmt: Fmt, q: Quality, hw: string | null = null): string[] {
  const { graph, out } = redactGraph(regions);
  const tail = videoFilter(fmt, [], { width: 0, fps: Math.round(f.fps || 12) });
  return ['-i', input, '-filter_complex', `${graph};[${out}]${tail}[vout]`, '-map', '[vout]', ...audioMap(fmt),
    ...videoEncodeArgs(fmt, q, f, 'copy', hw), '-map_metadata', '-1', output];
}

export function metadataArgs(input: string, output: string, o: { removeAll: boolean; tags: Record<string, string> }, fmt: Fmt): string[] {
  const a = ['-i', input, '-map', '0', '-c', 'copy', '-map_metadata', o.removeAll ? '-1' : '0'];
  if (o.removeAll) a.push('-map_chapters', '-1', '-fflags', '+bitexact');
  for (const [k, v] of Object.entries(o.tags)) a.push('-metadata', `${k}=${v}`);
  if (fmt === 'mp4' || fmt === 'mov') a.push('-movflags', Object.keys(o.tags).length ? '+faststart+use_metadata_tags' : '+faststart');
  a.push(output);
  return a;
}

export function canConcatCopy(list: MediaFacts[]): boolean {
  const a = list[0];
  return list.every((f) => f.videoCodec === a.videoCodec && f.width === a.width && f.height === a.height
    && Math.abs((f.fps ?? 0) - (a.fps ?? 0)) < 0.01 && f.hasAudio === a.hasAudio
    && f.audioCodec === a.audioCodec && f.sampleRate === a.sampleRate && f.channels === a.channels);
}

/** Contents of an FFmpeg concat-demuxer list file. */
export function concatListFile(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

export function concatArgs(listFile: string, output: string, fmt: Fmt): string[] {
  return ['-f', 'concat', '-safe', '0', '-i', listFile, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', ...faststart(fmt), output];
}

/** Re-encode a clip to a common size/fps/audio layout so the concat demuxer can copy it. */
export function normalizeClipArgs(input: string, output: string, f: MediaFacts, target: { width: number; height: number; fps: number }): string[] {
  const vf = `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${target.fps}`;
  const a = ['-i', input];
  if (!f.hasAudio) a.push('-f', 'lavfi', '-t', t3(f.durationSec), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  a.push('-map', '0:v:0', '-map', f.hasAudio ? '0:a:0' : '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', output);
  return a;
}
