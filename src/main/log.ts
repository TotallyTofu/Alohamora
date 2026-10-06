import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let stream: fs.WriteStream | null = null;

function out(): fs.WriteStream {
  if (!stream) {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    stream = fs.createWriteStream(path.join(dir, 'main.log'), { flags: 'a' });
  }
  return stream;
}

function fmt(a: unknown): string {
  if (a instanceof Error) return a.stack ?? a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function write(level: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level} ${args.map(fmt).join(' ')}`;
  console.log(line);
  out().write(line + '\n');
}

export const log = {
  info: (...a: unknown[]): void => write('INFO', a),
  warn: (...a: unknown[]): void => write('WARN', a),
  error: (...a: unknown[]): void => write('ERROR', a)
};
