import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CanceledError, ToolError } from '../errors';
import { ffmpegPath, ffprobePath } from '../paths';
import { friendlyFfmpegError, parseProbeJson, type ProbeResult } from './ffmpegParse';
import { runProcess } from './process';

export interface FfmpegRunOptions {
  durationSec?: number;                 // expected OUTPUT duration, for progress
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Runs ffmpeg with progress reporting. `args` must NOT include -y/-progress (added here). */
export function runFfmpeg(args: string[], opts: FfmpegRunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new CanceledError()); return; }
    const full = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...args];
    const child = spawn(ffmpegPath(), full, { windowsHide: true });
    let stderr = '';
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq);
        const v = line.slice(eq + 1);
        if ((k === 'out_time_us' || k === 'out_time_ms') && opts.durationSec && opts.onProgress) {
          const us = Number(v);   // both keys are microseconds in FFmpeg
          if (Number.isFinite(us) && us > 0) opts.onProgress(Math.min(0.999, us / 1e6 / opts.durationSec));
        }
        if (k === 'progress' && v === 'end') opts.onProgress?.(1);
      }
    });
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-12000); });
    const onAbort = (): void => { child.kill(); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { opts.signal?.removeEventListener('abort', onAbort); reject(e); });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) { reject(new CanceledError()); return; }
      if (code === 0) { resolve(); return; }
      const tail = stderr.split(/\r?\n/).slice(-15).join('\n');
      reject(new ToolError(friendlyFfmpegError(stderr), `ffmpeg ${full.join(' ')}\n\n${tail}`));
    });
  });
}

/** Run ffmpeg and return stdout (use with `-f image2pipe … pipe:1`). */
export async function runFfmpegToBuffer(args: string[], signal?: AbortSignal): Promise<Buffer> {
  const r = await runProcess(ffmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { signal, name: 'FFmpeg' });
  return r.stdout;
}

/** Run ffmpeg at loglevel info and return stderr (for loudnorm/volumedetect analysis). */
export async function runFfmpegCapture(args: string[], signal?: AbortSignal): Promise<string> {
  const r = await runProcess(ffmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'info', ...args], { signal, name: 'FFmpeg' });
  return r.stderr;
}

const probeCache = new Map<string, ProbeResult>();

export async function probe(filePath: string): Promise<ProbeResult> {
  const st = await fs.promises.stat(filePath);
  const key = `${filePath}|${st.size}|${st.mtimeMs}`;
  const hit = probeCache.get(key);
  if (hit) return hit;
  const r = await runProcess(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], { name: 'FFprobe' })
    .catch((e: unknown) => {
      // Appendix C: "not really the format its name says" instead of "FFprobe failed (exit code 1)"
      if (e instanceof ToolError) throw new ToolError(friendlyFfmpegError(e.details), e.details);
      throw e;
    });
  const result = parseProbeJson(r.stdout.toString('utf8'));
  if (probeCache.size > 300) probeCache.clear();
  probeCache.set(key, result);
  return result;
}
