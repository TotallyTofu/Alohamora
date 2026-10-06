import { escapeXml } from '@shared/text';

export const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

export const STYLE_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; }
p { margin: 0 0 0.8em; text-align: justify; }
ul { margin: 0 0 0.8em 1.2em; }`;

export function chapterXhtml(title: string, body: string, lang: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;
}

export function fixedPageXhtml(title: string, img: string, w: number, h: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><meta name="viewport" content="width=${w}, height=${h}"/>
<style>html,body{margin:0;padding:0}img{display:block;width:${w}px;height:${h}px}</style></head>
<body><img src="${escapeXml(img)}" alt="${escapeXml(title)}"/></body>
</html>`;
}

export function navXhtml(title: string, items: Array<{ href: string; title: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${items.map((i) => `<li><a href="${escapeXml(i.href)}">${escapeXml(i.title)}</a></li>`).join('\n')}
</ol></nav></body>
</html>`;
}

export interface OpfInput {
  title: string; author?: string; lang: string; id: string; fixed: boolean;
  items: Array<{ id: string; href: string; type: string }>;
  images: Array<{ id: string; href: string; type: string }>;
}

export function opfXml(o: OpfInput): string {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    ...(o.fixed ? [] : ['<item id="css" href="style.css" media-type="text/css"/>']),
    ...o.items.map((i) => `<item id="${i.id}" href="${escapeXml(i.href)}" media-type="${i.type}"/>`),
    ...o.images.map((i) => `<item id="${i.id}" href="${escapeXml(i.href)}" media-type="${i.type}"/>`)
  ].join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(o.lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${o.id}</dc:identifier>
    <dc:title>${escapeXml(o.title)}</dc:title>
    <dc:language>${escapeXml(o.lang)}</dc:language>
    ${o.author ? `<dc:creator>${escapeXml(o.author)}</dc:creator>` : ''}
    <meta property="dcterms:modified">${modified}</meta>
    ${o.fixed ? '<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta>' : ''}
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${o.items.map((i) => `<itemref idref="${i.id}"/>`).join('\n    ')}
  </spine>
</package>`;
}
