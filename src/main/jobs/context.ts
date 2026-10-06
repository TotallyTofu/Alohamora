import fs from 'node:fs';
import path from 'node:path';
import { groupFileName, groupFolderName, outputFileName, resolveCollision, sanitizeFileName, splitName } from '@shared/naming';
import type { Capabilities, Settings } from '@shared/types';
import { jobsTempRoot } from '../paths';
import { moveFile, pathKey } from '../util';

export interface OutputSpec {
  source: string;          // input file this output derives from (decides folder + base name)
  ext: string;             // output extension without dot
  suffix?: string;         // "-compressed"
  group?: string;          // multi-file output → folder "<base>-<group>/<base>-001.ext"
  index?: number;          // 1-based (group only)
  total?: number;          // group size (for zero padding)
  nameOverride?: string;   // full file name (rare)
}

export interface JobContext {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly tempDir: string;
  readonly settings: Settings;
  readonly caps: Capabilities;
  progress(fraction: number, detail?: string): void;          // 0..1 within current subtask
  setSubtask(index: number, total: number, detail?: string): void;
  newOutput(spec: OutputSpec): string;                         // returns temp path to write to
  dropOutput(tempPath: string): void;                          // e.g. compressed file was bigger
  tempPath(name: string): string;                              // scratch file path (not an output)
  note(text: string): void;                                    // shown on the Done card
}

const reserved = new Set<string>();
const taken = (p: string): boolean => reserved.has(pathKey(p)) || fs.existsSync(p);

export class JobRun implements JobContext {
  readonly tempDir: string;
  readonly notes: string[] = [];
  private outputs: Array<{ tempPath: string; spec: OutputSpec }> = [];
  private dropped = new Set<string>();
  private sub = { index: 0, total: 1 };
  private scratch = 0;

  constructor(
    readonly id: string,
    readonly signal: AbortSignal,
    readonly settings: Settings,
    readonly caps: Capabilities,
    private report: (overall: number, detail?: string) => void
  ) {
    this.tempDir = path.join(jobsTempRoot(), id);
  }

  async init(): Promise<void> { await fs.promises.mkdir(this.tempDir, { recursive: true }); }

  setSubtask(index: number, total: number, detail?: string): void {
    this.sub = { index, total: Math.max(1, total) };
    this.report(index / this.sub.total, detail);
  }

  progress(fraction: number, detail?: string): void {
    const f = Math.min(1, Math.max(0, fraction));
    this.report((this.sub.index + f) / this.sub.total, detail);
  }

  newOutput(spec: OutputSpec): string {
    const ext = spec.ext.replace(/^\./, '').toLowerCase();
    const tempPath = path.join(this.tempDir, `out-${this.outputs.length}.${ext}`);
    this.outputs.push({ tempPath, spec: { ...spec, ext } });
    return tempPath;
  }

  dropOutput(tempPath: string): void { this.dropped.add(tempPath); }

  tempPath(name: string): string {
    this.scratch++;
    return path.join(this.tempDir, `tmp-${this.scratch}-${name}`);
  }

  note(text: string): void { this.notes.push(text); }

  /** Move outputs to their final names. Returns final absolute paths. */
  async finalize(inputs: string[]): Promise<string[]> {
    const inputSet = new Set(inputs.map((p) => pathKey(p)));
    const groupDirs = new Map<string, string>();
    const finals: string[] = [];
    const mine: string[] = [];
    try {
      for (const o of this.outputs) {
        if (this.dropped.has(o.tempPath)) continue;
        if (!fs.existsSync(o.tempPath)) throw new Error(`Expected output was not created (${path.basename(o.tempPath)})`);
        const { base } = splitName(path.basename(o.spec.source));
        const custom = this.settings.outputMode === 'custom-folder' && this.settings.customOutputDir;
        const outDir = custom ? (this.settings.customOutputDir as string) : path.dirname(o.spec.source);
        let finalPath: string;
        if (o.spec.group) {
          const key = `${o.spec.source}|${o.spec.group}`;
          let dir = groupDirs.get(key);
          if (!dir) {
            dir = resolveCollision(outDir, sanitizeFileName(groupFolderName(base, o.spec.group)), taken, path.join);
            await fs.promises.mkdir(dir, { recursive: true });
            groupDirs.set(key, dir);
          }
          finalPath = resolveCollision(dir, sanitizeFileName(groupFileName(base, o.spec.index ?? 1, o.spec.total ?? 1, o.spec.ext)), taken, path.join);
        } else {
          const name = o.spec.nameOverride ?? outputFileName(base, o.spec.ext, o.spec.suffix);
          finalPath = resolveCollision(outDir, sanitizeFileName(name), taken, path.join);
        }
        if (inputSet.has(pathKey(finalPath))) throw new Error('Refusing to overwrite an input file');
        reserved.add(pathKey(finalPath));
        mine.push(pathKey(finalPath));
        await moveFile(o.tempPath, finalPath);
        finals.push(finalPath);
      }
    } finally {
      for (const p of mine) reserved.delete(p);
    }
    return finals;
  }

  async cleanup(): Promise<void> {
    await fs.promises.rm(this.tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
  }
}
