import fs from 'node:fs';
import type { FileInfo } from '@shared/types';
import { withDefaults, type JoinOptions } from '@shared/toolOptions';
import { throwIfAborted } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { canConcatCopy, concatArgs, concatListFile, normalizeClipArgs } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { sameFmt, videoFacts } from './common';

/** Apply the user's order (paths); anything not mentioned keeps its input position at the end. */
export function orderFiles(files: FileInfo[], order: string[]): FileInfo[] {
  if (order.length === 0) return files;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const picked = order.map((p) => byPath.get(p)).filter((f): f is FileInfo => !!f);
  const rest = files.filter((f) => !order.includes(f.path));
  return [...picked, ...rest];
}

export const runVideoJoin: ToolRunFn = async (files, options, ctx) => {
  const o = withDefaults<JoinOptions>('video.join', options);
  const ordered = orderFiles(files, o.order);
  const facts = [];
  for (const f of ordered) facts.push(await videoFacts(f));
  const first = ordered[0];
  const totalSec = facts.reduce((n, f) => n + f.durationSec, 0);

  if (canConcatCopy(facts)) {
    const fmt = sameFmt(first);
    const list = ctx.tempPath('list.txt');
    await fs.promises.writeFile(list, concatListFile(ordered.map((f) => f.path)), 'utf8');
    const out = ctx.newOutput({ source: first.path, ext: fmt, suffix: 'joined' });
    await runFfmpeg(concatArgs(list, out, fmt), { durationSec: totalSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
    return;
  }

  // Clips differ: bring every clip to the first clip's size / frame rate, then copy-concat the results.
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
  const target = {
    width: even(facts[0].width ?? 1280), height: even(facts[0].height ?? 720),
    fps: Math.min(60, Math.round(facts[0].fps || 30)) || 30
  };
  const parts: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    throwIfAborted(ctx.signal);
    const tmp = ctx.tempPath(`n${i}.mp4`);
    await runFfmpeg(normalizeClipArgs(ordered[i].path, tmp, facts[i], target), {
      durationSec: facts[i].durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(((i + p) / ordered.length) * 0.8)
    });
    parts.push(tmp);
  }
  const list = ctx.tempPath('list.txt');
  await fs.promises.writeFile(list, concatListFile(parts), 'utf8');
  const out = ctx.newOutput({ source: first.path, ext: 'mp4', suffix: 'joined' });
  await runFfmpeg(concatArgs(list, out, 'mp4'), { durationSec: totalSec, signal: ctx.signal, onProgress: (p) => ctx.progress(0.8 + p * 0.2) });
  ctx.note('Clips were re-encoded to match');
};
