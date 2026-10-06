export class UserError extends Error {
  constructor(message: string, public details?: string) { super(message); this.name = 'UserError'; }
}
export class ToolError extends Error {
  constructor(message: string, public details: string) { super(message); this.name = 'ToolError'; }
}
export class CanceledError extends Error {
  constructor() { super('Canceled'); this.name = 'CanceledError'; }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new CanceledError();
}

export function toUserMessage(err: unknown): { message: string; details?: string } {
  if (err instanceof UserError) return { message: err.message, details: err.details };
  if (err instanceof ToolError) return { message: err.message, details: err.details };
  const e = err as Error | undefined;
  return { message: 'Something went wrong while processing this file.', details: e?.stack ?? String(err) };
}
