import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { ToolError, toUserMessage, UserError } from '../errors';
import { runJobNow } from '../jobs/execute';
import { detectHardwareVideo } from '../engines/hwVideo';
import { CASES } from './cases';
import { ensureFixture } from './fixtures';

type Result = { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; ms: number; info?: string };

function describeError(e: unknown): string {
  if (e instanceof UserError || e instanceof ToolError) {
    const tail = (e.details ?? '').split('\n').filter(Boolean).slice(-3).join(' / ');
    return tail ? `${e.message} | ${tail}` : e.message;
  }
  if (e instanceof Error) {
    const where = (e.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim().replace(/\(.*[\\/]/, '(')).join(' / ');
    return where ? `${e.message} | ${where}` : e.message;     // unexpected errors keep their first stack frames in the report
  }
  return String(e);
}

export async function runSelfTest(argv: string[]): Promise<number> {
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const root = app.isPackaged ? path.join(app.getPath('temp'), 'alohamora-selftest') : path.join(app.getAppPath(), '.selftest');
  const fxDir = path.join(root, 'fixtures');
  const outRoot = path.join(root, 'out');
  await fs.promises.rm(outRoot, { recursive: true, force: true });
  await detectHardwareVideo();            // so hardware-encoder cases know what this machine can do
  const caps = getCapabilities();
  const cases = CASES.filter((c) => !only || c.group === only || c.group.startsWith(`${only}.`) || c.name.startsWith(only));
  const results: Result[] = [];

  for (const c of cases) {
    const t0 = Date.now();
    const skip = c.skip?.(caps);
    if (skip) { results.push({ name: c.name, status: 'SKIP', ms: 0, info: skip }); console.log(`SKIP  ${c.name}  (${skip})`); continue; }
    try {
      const inputs: string[] = [];
      for (const f of c.fixtures) inputs.push(await ensureFixture(fxDir, f));
      const outDir = path.join(outRoot, c.name.replace(/[^\w.-]+/g, '_'));
      await fs.promises.mkdir(outDir, { recursive: true });
      let outputs: string[] = [];
      let error: unknown = null;
      try {
        const settings = { ...DEFAULT_SETTINGS, outputMode: 'custom-folder' as const, customOutputDir: outDir };
        outputs = (await runJobNow(c.request(inputs), { settings, caps: { ...caps, ...c.capsOverride } })).outputs;
      } catch (e) {
        error = e;
      }
      if (c.expectError) {
        const msg = error ? toUserMessage(error).message : '';
        if (!error || !c.expectError.test(msg)) throw new Error(`expected error ${c.expectError}, got ${error ? `"${msg}"` : 'success'}`);
      } else {
        if (error) throw error;
        if (!c.check) throw new Error('case has no check');
        await c.check(outputs);
      }
      const ms = Date.now() - t0;
      results.push({ name: c.name, status: 'PASS', ms });
      console.log(`PASS  ${c.name}  (${ms} ms)`);
    } catch (e) {
      const info = describeError(e);
      results.push({ name: c.name, status: 'FAIL', ms: Date.now() - t0, info });
      console.log(`FAIL  ${c.name}  — ${info}`);
    }
  }

  const count = (s: Result['status']): number => results.filter((r) => r.status === s).length;
  const summary = `${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`;
  await fs.promises.mkdir(root, { recursive: true });
  const reportPath = path.join(root, 'report.json');
  await fs.promises.writeFile(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nSELFTEST: ${summary}\nReport: ${reportPath}`);
  return count('FAIL') > 0 || results.length === 0 ? 1 : 0;
}
