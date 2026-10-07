import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const win = getCurrentWindow();

/** Minimise / maximise / close for Windows, where the main window has no native title bar (decorations off). */
export function CaptionButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const refresh = (): void => { void win.isMaximized().then(setMaximized); };
    refresh();
    const off = win.onResized(refresh);
    return () => { void off.then((un) => un()); };
  }, []);
  return (
    <div className="caption-buttons">
      <button type="button" aria-label="Minimize" onClick={() => void win.minimize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => void win.toggleMaximize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized
            ? <path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" />
            : <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />}
        </svg>
      </button>
      <button type="button" className="is-close" aria-label="Close" onClick={() => void win.close()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
