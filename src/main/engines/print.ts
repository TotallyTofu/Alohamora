import { BrowserWindow, session, type Session } from 'electron';
import { blockNetwork } from '../security';

let printSession: Session | null = null;
function getPrintSession(): Session {
  if (!printSession) {
    printSession = session.fromPartition('alohamora-print');
    blockNetwork(printSession);
  }
  return printSession;
}

export interface PrintOptions {
  css?: string;                                                    // injected as USER stylesheet (wins with !important)
  pageSize?: 'A4' | 'Letter' | 'A5' | { width: number; height: number };   // object = inches
  zeroMargins?: boolean;
  landscape?: boolean;
}

/** Render a local HTML/XHTML file to PDF (JavaScript disabled, network blocked). */
export async function htmlFileToPdf(filePath: string, o: PrintOptions = {}): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false, width: 1000, height: 1400,
    webPreferences: { session: getPrintSession(), javascript: false, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  try {
    await win.loadFile(filePath);
    if (o.css) await win.webContents.insertCSS(o.css, { cssOrigin: 'user' });
    await new Promise((r) => setTimeout(r, 200));       // let images/fonts settle
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: !o.pageSize,
      landscape: o.landscape ?? false,
      ...(o.pageSize ? { pageSize: o.pageSize } : {}),
      ...(o.zeroMargins ? { margins: { top: 0, bottom: 0, left: 0, right: 0 } } : {})
    });
  } finally {
    win.destroy();
  }
}
