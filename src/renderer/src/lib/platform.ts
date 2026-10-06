export type UiPlatform = 'win32' | 'darwin' | 'linux';

const ua = navigator.userAgent;
const platform: UiPlatform = ua.includes('Macintosh') ? 'darwin' : ua.includes('Windows') ? 'win32' : 'linux';

export const getPlatform = (): UiPlatform => platform;
export const isMacUi = (): boolean => platform === 'darwin';

/** Name of the Alt key as users know it. */
export const altKeyName = (): string => (isMacUi() ? 'Option' : 'Alt');
/** Keycap for the tools modifier: ⌥ option on Mac (like clean UI.png), ⎇ alt elsewhere. */
export const altKeycap = (): { glyph: string; label: string } => (isMacUi() ? { glyph: '⌥', label: 'option' } : { glyph: '⎇', label: 'alt' });
/** Button text for "reveal file". */
export const revealLabel = (): string => (platform === 'darwin' ? 'Show in Finder' : platform === 'win32' ? 'Show in Explorer' : 'Show in folder');
/** Multi-select modifier: ⌘ on Mac, Ctrl elsewhere. */
export const modClick = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMacUi() ? e.metaKey : e.ctrlKey);
