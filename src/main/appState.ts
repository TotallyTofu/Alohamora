let quitting = false;
let trayActive = false;
export const isQuitting = (): boolean => quitting;
export const setQuitting = (): void => { quitting = true; };
/** Set by integrations/tray.ts (Task 11.4). Until a tray icon exists, closing the main window quits the app. */
export const isTrayActive = (): boolean => trayActive;
export const setTrayActive = (v: boolean): void => { trayActive = v; };
