/** "a.b.mp4" → {base:"a.b", ext:"mp4"}; ".bashrc" → {base:".bashrc", ext:""} */
export function splitName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
}

export function outputFileName(base: string, ext: string, suffix?: string): string {
  return `${base}${suffix ? `-${suffix}` : ''}.${ext}`;
}

export function groupFolderName(base: string, group: string): string {
  return `${base}-${group}`;
}

/** "report", 3, 120, "jpg" → "report-003.jpg" (padding grows with total). */
export function groupFileName(base: string, index: number, total: number, ext: string): string {
  const pad = Math.max(3, String(total).length);
  return `${base}-${String(index).padStart(pad, '0')}.${ext}`;
}

/** "a.jpg", 2 → "a (2).jpg"; "folder", 1 → "folder (1)" */
export function withCounter(name: string, n: number): string {
  const { base, ext } = splitName(name);
  return ext ? `${base} (${n}).${ext}` : `${name} (${n})`;
}

/** First free path: name, name (1), name (2)… */
export function resolveCollision(
  dir: string,
  name: string,
  exists: (fullPath: string) => boolean,
  join: (a: string, b: string) => string
): string {
  let candidate = join(dir, name);
  for (let n = 1; exists(candidate); n++) {
    if (n > 9999) throw new Error('Too many files with the same name');
    candidate = join(dir, withCounter(name, n));
  }
  return candidate;
}

/** Remove characters Windows forbids; trim; limit length. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let s = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
  if (s.length === 0) s = 'output';
  if (s.length > 180) {
    const { base, ext } = splitName(s);
    s = `${base.slice(0, 170)}${ext ? `.${ext}` : ''}`;
  }
  return s;
}
