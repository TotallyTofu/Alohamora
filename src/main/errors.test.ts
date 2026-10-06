import { describe, expect, it } from 'vitest';
import { CanceledError, ToolError, UserError, throwIfAborted, toUserMessage } from './errors';

const withCode = (code: string): Error => Object.assign(new Error(`oops ${code}`), { code });

describe('toUserMessage', () => {
  it('passes user and tool errors through', () => {
    expect(toUserMessage(new UserError('Nope', 'why'))).toEqual({ message: 'Nope', details: 'why' });
    expect(toUserMessage(new ToolError('Tool broke', 'stderr'))).toEqual({ message: 'Tool broke', details: 'stderr' });
  });

  it('maps permission and disk errors to plain language', () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY', 'EROFS']) {
      expect(toUserMessage(withCode(code)).message).toContain("can't read or write");
    }
    expect(toUserMessage(withCode('ENOSPC')).message).toBe('The disk is full.');
  });

  it('keeps technical details for unknown errors', () => {
    const m = toUserMessage(new Error('boom'));
    expect(m.message).toBe('Something went wrong while processing this file.');
    expect(m.details).toContain('boom');
  });
});

describe('throwIfAborted', () => {
  it('throws CanceledError only after abort', () => {
    const c = new AbortController();
    expect(() => throwIfAborted(c.signal)).not.toThrow();
    c.abort();
    expect(() => throwIfAborted(c.signal)).toThrow(CanceledError);
  });
});
