import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { JobRequest, JobUpdate } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { CanceledError, toUserMessage } from '../errors';
import { log } from '../log';
import { getSettings } from '../settings';
import { jobLabel, runJobNow } from './execute';

interface Rec { update: JobUpdate; controller: AbortController; lastEmit: number }

export class JobQueue {
  private jobs = new Map<string, Rec>();
  private running = 0;

  constructor(private emit: (u: JobUpdate) => void, private onFinished: (u: JobUpdate) => void) {}

  enqueue(request: JobRequest): string {
    const id = randomUUID();
    const update: JobUpdate = { id, label: jobLabel(request), request, status: 'queued', progress: 0, outputs: [], createdAt: Date.now() };
    this.jobs.set(id, { update, controller: new AbortController(), lastEmit: 0 });
    this.emit(update);
    this.trim();
    this.pump();
    return id;
  }

  cancel(id: string): void {
    const r = this.jobs.get(id);
    if (!r) return;
    if (r.update.status === 'queued') this.finish(r, { status: 'canceled' });
    else if (r.update.status === 'running') r.controller.abort();
  }

  list(): JobUpdate[] {
    return [...this.jobs.values()].map((r) => r.update).sort((a, b) => b.createdAt - a.createdAt);
  }

  private pump(): void {
    const limit = Math.max(1, getSettings().maxConcurrentJobs);
    while (this.running < limit) {
      const next = [...this.jobs.values()]
        .filter((r) => r.update.status === 'queued')
        .sort((a, b) => a.update.createdAt - b.update.createdAt)[0];
      if (!next) return;
      this.running++;
      void this.run(next).finally(() => { this.running--; this.pump(); });
    }
  }

  private async run(r: Rec): Promise<void> {
    this.patch(r, { status: 'running', progress: 0 }, true);
    try {
      const res = await runJobNow(r.update.request, {
        id: r.update.id,
        signal: r.controller.signal,
        settings: getSettings(),
        caps: getCapabilities(),
        onProgress: (p, detail) => this.patch(r, { progress: p, detail: detail ?? r.update.detail }, false)
      });
      let outputBytes = 0;
      for (const o of res.outputs) outputBytes += await fs.promises.stat(o).then((s) => s.size).catch(() => 0);
      this.finish(r, { status: 'done', progress: 1, outputs: res.outputs, note: res.notes.join(' · ') || undefined, outputBytes });
    } catch (e) {
      if (e instanceof CanceledError || r.controller.signal.aborted) {
        this.finish(r, { status: 'canceled' });
      } else {
        const m = toUserMessage(e);
        log.error('Job failed:', r.update.label, e);
        this.finish(r, { status: 'error', error: m.message, errorDetails: m.details });
      }
    }
  }

  private patch(r: Rec, p: Partial<JobUpdate>, force: boolean): void {
    r.update = { ...r.update, ...p };
    const now = Date.now();
    if (force || now - r.lastEmit > 100) { r.lastEmit = now; this.emit(r.update); }
  }

  private finish(r: Rec, p: Partial<JobUpdate>): void {
    this.patch(r, { ...p, finishedAt: Date.now() }, true);
    this.onFinished(r.update);
  }

  private trim(): void {
    const finished = this.list().filter((u) => u.status !== 'queued' && u.status !== 'running');
    for (const u of finished.slice(50)) this.jobs.delete(u.id);
  }
}

let instance: JobQueue | null = null;
export function initQueue(emit: (u: JobUpdate) => void, onFinished: (u: JobUpdate) => void): JobQueue {
  instance = new JobQueue(emit, onFinished);
  return instance;
}
export function getQueue(): JobQueue {
  if (!instance) throw new Error('Queue not initialised');
  return instance;
}
