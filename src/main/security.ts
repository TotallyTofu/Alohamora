import { app, session, type Session } from 'electron';

/** Cancel every http(s)/ws(s) request except the Vite dev server in development. */
export function blockNetwork(ses: Session = session.defaultSession): void {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  const devHost = !app.isPackaged && dev ? new URL(dev).host : null;
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, cb) => {
    if (devHost && new URL(details.url).host === devHost) { cb({}); return; }
    cb({ cancel: true });
  });
}

/** No popups, no navigation away from the app. */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event, url) => {
      const dev = process.env['ELECTRON_RENDERER_URL'];
      const ok = url.startsWith('app://') || (!!dev && url.startsWith(dev));
      if (!ok) event.preventDefault();
    });
  });
}
