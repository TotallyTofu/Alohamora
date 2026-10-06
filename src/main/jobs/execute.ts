import { randomUUID } from 'node:crypto';
import { FORMATS } from '@shared/formats';
import { toolMeta } from '@shared/tools';
import type { Capabilities, JobRequest, Settings } from '@shared/types';
import { CONVERTERS } from '../converters';
import { throwIfAborted, UserError } from '../errors';
import { inspectFiles } from '../inspect';
import { TOOL_RUNNERS } from '../tools';
import { JobRun, type JobContext } from './context';

export function jobLabel(req: JobRequest): string {
  return req.kind === 'convert' ? `Convert to ${FORMATS[req.target].label}` : toolMeta(req.toolId).label;
}

const detailFor = (name: string, i: number, n: number): string => (n > 1 ? `${name} · ${i + 1} of ${n}` : name);

export async function executeRequest(req: JobRequest, ctx: JobContext): Promise<void> {
  const files = await inspectFiles(req.inputs, true);
  if (files.length === 0) throw new UserError('No files to process.');

  if (req.kind === 'convert') {
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      throwIfAborted(ctx.signal);
      const f = files[i];
      ctx.setSubtask(i, files.length, detailFor(f.name, i, files.length));
      if (f.fmt === req.target) { skipped++; continue; }
      if (!f.category || !f.fmt) throw new UserError(`${f.name} is not a supported file type.`);
      const convert = CONVERTERS[f.category];
      if (!convert) throw new UserError(`Converting ${FORMATS[f.fmt].label} files is not available yet.`);
      await convert(f, req.target, req.options ?? {}, ctx);
    }
    if (skipped > 0) ctx.note(`${skipped} file${skipped > 1 ? 's were' : ' was'} already ${FORMATS[req.target].label}`);
    return;
  }

  const meta = toolMeta(req.toolId);
  const run = TOOL_RUNNERS[req.toolId];
  if (!run) throw new UserError(`${meta.label} is not available yet.`);
  if (files.length < meta.minInputs) throw new UserError(`${meta.label} needs at least ${meta.minInputs} files.`);
  if (meta.perFile) {
    for (let i = 0; i < files.length; i++) {
      throwIfAborted(ctx.signal);
      ctx.setSubtask(i, files.length, detailFor(files[i].name, i, files.length));
      await run([files[i]], req.options, ctx);
    }
  } else {
    ctx.setSubtask(0, 1, `${files.length} files`);
    await run(files, req.options, ctx);
  }
}

export interface RunJobOptions {
  id?: string;
  signal?: AbortSignal;
  settings: Settings;
  caps: Capabilities;
  onProgress?: (overall: number, detail?: string) => void;
}

/** Execute a request start-to-finish (used by the queue AND the self-test). */
export async function runJobNow(req: JobRequest, o: RunJobOptions): Promise<{ outputs: string[]; notes: string[] }> {
  const run = new JobRun(o.id ?? randomUUID(), o.signal ?? new AbortController().signal, o.settings, o.caps, o.onProgress ?? (() => undefined));
  try {
    await run.init();
    await executeRequest(req, run);
    const outputs = await run.finalize(req.inputs);
    return { outputs, notes: run.notes };
  } finally {
    await run.cleanup();
  }
}
