import { AlignmentType, Document, ImageRun, Packer, PageBreak, Paragraph } from 'docx';
import type { EmbeddableImage } from './pdfOps';

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
