import piexif from 'piexifjs';

type ExifObj = Record<string, Record<number, unknown> | null | undefined>;

function loadExif(bin: string): ExifObj {
  try { return piexif.load(bin) as ExifObj; } catch { return { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {}, thumbnail: null }; }
}
function dumpSafe(exif: ExifObj): string {
  const e = { ...exif, thumbnail: null, '1st': {} } as ExifObj;
  if (e.Exif) delete (e.Exif as Record<number, unknown>)[piexif.ExifIFD.MakerNote];   // MakerNotes often break dump()
  return piexif.dump(e);
}

export function jpegRemoveGps(buf: Buffer): Buffer {
  const bin = buf.toString('binary');
  const exif = loadExif(bin);
  exif.GPS = {};
  return Buffer.from(piexif.insert(dumpSafe(exif), bin), 'binary');
}

export function jpegEditFields(buf: Buffer, f: { artist?: string; copyright?: string; description?: string; dateTaken?: string }): Buffer {
  const bin = buf.toString('binary');
  const exif = loadExif(bin);
  const zeroth = (exif['0th'] ??= {}) as Record<number, unknown>;
  const ex = (exif.Exif ??= {}) as Record<number, unknown>;
  if (f.artist !== undefined) zeroth[piexif.ImageIFD.Artist] = f.artist;
  if (f.copyright !== undefined) zeroth[piexif.ImageIFD.Copyright] = f.copyright;
  if (f.description !== undefined) zeroth[piexif.ImageIFD.ImageDescription] = f.description;
  if (f.dateTaken) ex[piexif.ExifIFD.DateTimeOriginal] = f.dateTaken;   // "YYYY:MM:DD HH:MM:SS"
  return Buffer.from(piexif.insert(dumpSafe(exif), bin), 'binary');
}
