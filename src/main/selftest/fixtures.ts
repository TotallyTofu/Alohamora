import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { textToHtml } from '@shared/text';
import { runFfmpeg } from '../engines/ffmpeg';
import { buildFixedEpub, buildReflowEpub } from '../engines/epubWriter';
import { encodeHeicFile } from '../engines/heif';
import { htmlFileToPdf } from '../engines/print';
import { pdfRenderPage, withPdf } from '../engines/pdfEngine';

type Maker = (out: string, dir: string) => Promise<void>;

const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1">
<stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#2b6cff"/></linearGradient></defs>
<rect x="40" y="40" width="720" height="520" rx="60" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>`;

export const FIXTURES: Record<string, Maker> = {
  'video.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out]),
  'titled.mp4': async (out, dir) => {
    await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', '-metadata', 'title=Hello', out]);
  },
  'video-copy.mp4': async (out, dir) => {
    await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', out]);
  },
  'video-noaudio.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]),
  'video.mkv': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', out]); },
  'anim.gif': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-t', '2', '-vf', 'fps=10,scale=160:-1', out]); },
  'audio.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-ac', '2', '-c:a', 'pcm_s16le', out]),
  'audio-mono.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=3', '-ac', '1', '-c:a', 'pcm_s16le', out]),
  'audio-silent.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2', '-c:a', 'pcm_s16le', out]),
  'audio.mp3': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'audio.wav'), '-c:a', 'libmp3lame', '-q:a', '4', out]); },
  'stereo-lr.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4',
    '-filter_complex', '[0:a][1:a]join=inputs=2:channel_layout=stereo[a]', '-map', '[a]', '-c:a', 'pcm_s16le', out]),
  'image.svg': async (out) => { await fs.promises.writeFile(out, TEST_SVG, 'utf8'); },
  'image.png': async (out) => { await sharp(Buffer.from(TEST_SVG), { density: 72 }).png().toFile(out); },            // 800x600, transparent corners
  'photo.jpg': async (out) => {                                                                                     // 800x600 pixels + EXIF orientation 6
    await sharp(Buffer.from(TEST_SVG), { density: 72 }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 })
      .withMetadata({ orientation: 6 }).toFile(out);
  },
  'image.webp': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).webp().toFile(out); },
  'image.tiff': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).tiff().toFile(out); },
  'image.avif': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).avif().toFile(out); },
  'image.bmp': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'image.png'), '-pix_fmt', 'bgr24', out]); },
  'image.heic': async (out, dir) => { await encodeHeicFile(await ensureFixture(dir, 'image.png'), out, 80); },
  'text.txt': async (out) => {
    await fs.promises.writeFile(out, [
      'Kabooks test document',
      'Xin chào thế giới — Tiếng Việt có dấu.',
      'The quick brown fox jumps over the lazy dog. '.repeat(4).trim(),
      '',
      'Last line.'
    ].join('\n'), 'utf8');
  },
  'subs.srt': async (out) => {
    await fs.promises.writeFile(out, '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nThird\r\n', 'utf8');
  },
  'subs.vtt': async (out) => {
    await fs.promises.writeFile(out, 'WEBVTT\n\nNOTE test file\n\n00:01.000 --> 00:02.500 align:start\nHello <v Bob>world</v>\n\nid2\n00:00:03.000 --> 00:00:04.000\nSecond line\n', 'utf8');
  },
  'doc.pdf': async (out, dir) => {
    const pdf = await PDFDocument.create();
    pdf.setTitle('Kabooks Test');
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const reg = await pdf.embedFont(StandardFonts.Helvetica);
    const jpg = await pdf.embedJpg(await sharp(await ensureFixture(dir, 'image.png')).flatten({ background: '#fff' }).jpeg().toBuffer());
    const para = 'Kabooks converts files offline. This paragraph is long enough to wrap across several lines so that the reflow logic has something to join back together into one paragraph.';
    for (let p = 1; p <= 3; p++) {
      const page = pdf.addPage([612, 792]);
      page.drawText(p === 1 ? 'Kabooks Test Document' : `Chapter ${p}`, { x: 72, y: 700, size: 24, font: bold });
      const words = para.split(' ');
      let line = '';
      let y = 660;
      for (const w of words) {
        if (reg.widthOfTextAtSize(`${line} ${w}`, 12) > 460) { page.drawText(line.trim(), { x: 72, y, size: 12, font: reg }); y -= 16; line = ''; }
        line += ` ${w}`;
      }
      page.drawText(line.trim(), { x: 72, y, size: 12, font: reg });
      if (p === 2) page.drawImage(jpg, { x: 72, y: 300, width: 240, height: 180 });
      if (p === 3) ['• First item', '• Second item'].forEach((t, i) => page.drawText(t, { x: 72, y: 520 - i * 18, size: 12, font: reg }));
      page.drawText(String(p), { x: 300, y: 30, size: 10, font: reg });
    }
    await fs.promises.writeFile(out, await pdf.save());
  },
  'book.epub': async (out) => {
    await fs.promises.writeFile(out, await buildReflowEpub({ title: 'Test Book', lang: 'en' }, [
      { title: 'Chapter One', bodyXhtml: '<h1>Chapter One</h1><p>Kabooks converts files offline. Xin chào thế giới.</p>' },
      { title: 'Chapter Two', bodyXhtml: '<h1>Chapter Two</h1><p>Second chapter text.</p><ul><li>One</li><li>Two</li></ul>' }
    ]));
  },
  'fixed.epub': async (out, dir) => {
    const jpeg = await sharp(await ensureFixture(dir, 'image.png')).flatten({ background: '#fff' }).jpeg().toBuffer();
    await fs.promises.writeFile(out, await buildFixedEpub({ title: 'Fixed', lang: 'en' }, [
      { jpeg, width: 800, height: 600 }, { jpeg, width: 800, height: 600 }
    ]));
  },
  'scan.pdf': async (out, dir) => {
    const html = path.join(dir, 'tmp-scan.html');
    await fs.promises.writeFile(html, textToHtml('KABOOKS OCR TEST\n\nHello offline world.', { title: 'scan', font: 'sans', sizePt: 28, pageSize: 'a4' }), 'utf8');
    const textPdf = path.join(dir, 'tmp-scan-src.pdf');
    await fs.promises.writeFile(textPdf, await htmlFileToPdf(html));
    const png = await withPdf(textPdf, (doc) => pdfRenderPage(doc.id, 0, { dpi: 200, mime: 'image/png' }));
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(png);
    pdf.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    await fs.promises.writeFile(out, await pdf.save());
  }
};

/** Create the fixture once (cached in the fixtures dir) and return its path. */
export async function ensureFixture(dir: string, name: string): Promise<string> {
  const out = path.join(dir, name);
  if (fs.existsSync(out)) return out;
  const make = FIXTURES[name];
  if (!make) throw new Error(`No fixture maker for ${name}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `tmp-${name}`);        // keeps the extension for FFmpeg
  await make(tmp, dir);
  await fs.promises.rename(tmp, out);
  return out;
}
