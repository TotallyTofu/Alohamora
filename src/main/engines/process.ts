import { spawn } from 'node:child_process';
import { CanceledError, ToolError } from '../errors';

export interface ProcessResult { stdout: Buffer; stderr: string }

/** Run a binary with an args array (never a shell). Rejects with ToolError on non-zero exit. */
export function runProcess(exe: string, args: string[], opts: { signal?: AbortSignal; name?: string } = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new CanceledError()); return; }
    const child = spawn(exe, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-20000); });
    const onAbort = (): void => { child.kill(); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { opts.signal?.removeEventListener('abort', onAbort); reject(e); });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) { reject(new CanceledError()); return; }
      if (code === 0) resolve({ stdout: Buffer.concat(chunks), stderr });
      else reject(new ToolError(`${opts.name ?? 'Process'} failed (exit code ${code})`, stderr.split(/\r?\n/).slice(-20).join('\n')));
    });
  });
}
