import fs from 'node:fs';
import { toSrt, toVtt, textToCues } from '@shared/subtitles';
import { decodeText, TEXT_SIZE_PT, textToHtml } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { htmlFileToPdf } from '../engines/print';
import type { JobContext } from '../jobs/context';
import { pdfToImages } from './pdf';

export async function readText(file: FileInfo): Promise<string> {
  return decodeText(await fs.promises.readFile(file.path));
}

async function textToPdfFile(file: FileInfo, opts: ConvertOptions, ctx: JobContext): Promise<string> {
  const html = textToHtml(await readText(file), {
    title: file.name,
    font: opts.font && opts.font !== 'original' ? opts.font : 'mono',
    sizePt: TEXT_SIZE_PT[opts.textSize ?? 'medium'],
    pageSize: opts.pageSize ?? 'a4'
  });
  const htmlPath = ctx.tempPath('text.html');
  await fs.promises.writeFile(htmlPath, html, 'utf8');
  const pdfPath = ctx.tempPath('text.pdf');
  await fs.promises.writeFile(pdfPath, await htmlFileToPdf(htmlPath));
  return pdfPath;
}

export async function convertText(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const text = await readText(file);
  if (target === 'srt' || target === 'vtt') {
    const cues = textToCues(text, { timing: opts.cueTiming ?? 'reading', secondsPerCue: opts.secondsPerCue ?? 3 });
    if (cues.length === 0) throw new UserError('This text file is empty.');
    const out = ctx.newOutput({ source: file.path, ext: target });
    await fs.promises.writeFile(out, target === 'srt' ? '\uFEFF' + toSrt(cues) : toVtt(cues), 'utf8');
    return;
  }
  if (target === 'pdf') { await fs.promises.copyFile(await textToPdfFile(file, opts, ctx), ctx.newOutput({ source: file.path, ext: 'pdf' })); return; }
  if (target === 'jpg' || target === 'png') {
    const pdf = await textToPdfFile(file, opts, ctx);
    await pdfToImages(pdf, file.path, target, opts.imageDpi ?? 150, 0.9, ctx);
    return;
  }
  throw new UserError(`Converting text to ${target.toUpperCase()} is not available yet.`);
}
