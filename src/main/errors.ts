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

/** Appendix C wording for operating-system errors (locked, read-only or full disk). */
const OS_ERRORS: Record<string, string> = {
  EPERM: "Kabooks can't read or write this file. Close it in other apps and try again.",
  EACCES: "Kabooks can't read or write this file. Close it in other apps and try again.",
  EBUSY: "Kabooks can't read or write this file. Close it in other apps and try again.",
  EROFS: "Kabooks can't read or write this file. Close it in other apps and try again.",
  ENOSPC: 'The disk is full.'
};

export function toUserMessage(err: unknown): { message: string; details?: string } {
  if (err instanceof UserError) return { message: err.message, details: err.details };
  if (err instanceof ToolError) return { message: err.message, details: err.details };
  const e = err as (Error & { code?: string }) | undefined;
  const friendly = e?.code ? OS_ERRORS[e.code] : undefined;
  if (friendly) return { message: friendly, details: e?.stack ?? String(err) };
  return { message: 'Something went wrong while processing this file.', details: e?.stack ?? String(err) };
}
