import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import type { EmbeddableImage } from './pdfOps';
import type { Block } from '@shared/pdfReflow';

/** One image per page, scaled to fit 6.5 × 9 inches (624 × 864 px at 96 DPI). */
export async function imagesToDocx(images: EmbeddableImage[]): Promise<Buffer> {
  const children: Paragraph[] = [];
  images.forEach((img, i) => {
    const k = Math.min(1, 624 / img.width, 864 / img.height);
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: img.kind, data: img.data, transformation: { width: Math.round(img.width * k), height: Math.round(img.height * k) } })]
    }));
    if (i < images.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
  });
  return Packer.toBuffer(new Document({ creator: 'Kabooks', sections: [{ children }] }));
}

// docxWriter.ts additions

export async function blocksToDocx(blocks: Block[], title: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    const runs = b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic }));
    if (b.type === 'h1') children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs }));
    else if (b.type === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs }));
    else if (b.type === 'h3') children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs }));
    else if (b.type === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: runs }));
    else children.push(new Paragraph({ children: runs, spacing: { after: 160 } }));
  }
  return Packer.toBuffer(new Document({ creator: 'Kabooks', title, sections: [{ children }] }));
}

/** "Exact look": each PDF page becomes a full-page picture in its own section. */
export async function pageImagesToDocx(pages: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }>): Promise<Buffer> {
  const sections = pages.map((p) => ({
    properties: { page: {
      size: { width: Math.round(p.widthPt * 20), height: Math.round(p.heightPt * 20) },          // twips
      margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
    } },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({ type: 'jpg', data: p.jpeg, transformation: {
        width: Math.round(((p.widthPt * 96) / 72) * 0.98), height: Math.round(((p.heightPt * 96) / 72) * 0.98)
      } })]
    })]
  }));
  return Packer.toBuffer(new Document({ creator: 'Kabooks', sections }));
}
