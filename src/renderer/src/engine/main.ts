import type { EngineApi, EngineMethod } from '@shared/ipc';
import { PDF_HANDLERS } from './pdf';

declare global { interface Window { kabooksEngine: EngineApi } }

type Handler = (params: never) => Promise<unknown>;
const handlers: Partial<Record<EngineMethod, Handler>> = {
  ping: async () => 'pong',
  ...PDF_HANDLERS
};

/** Phase 6 registers pdf.* handlers through this function. */
export function registerHandlers(extra: Partial<Record<EngineMethod, Handler>>): void {
  Object.assign(handlers, extra);
}

window.kabooksEngine.onCall(async (call) => {
  try {
    const fn = handlers[call.method];
    if (!fn) throw new Error(`Unknown engine method ${call.method}`);
    const result = await fn(call.params as never);
    window.kabooksEngine.sendResult({ id: call.id, ok: true, result });
  } catch (e) {
    const err = e as Error;
    window.kabooksEngine.sendResult({ id: call.id, ok: false, error: `${err.name ?? 'Error'}: ${err.message ?? String(e)}` });
  }
});

window.kabooksEngine.ready();
