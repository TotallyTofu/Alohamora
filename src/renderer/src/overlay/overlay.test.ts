import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./overlay.css', import.meta.url), 'utf8');
/** The declarations of one rule, e.g. rule('.card') → "width: 100%; …". */
const rule = (selector: string): string => {
  const m = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule for ${selector} in overlay.css`);
  return m[1].replace(/\s+/g, ' ');
};

// Vitest has no layout engine, so these check the rules that keep the cards inside the overlay window
// (checked in a browser with a 428×368 window and an 80-character file name).
describe('overlay cards fit the window', () => {
  it('the centring grid has a fixed-width column', () => {
    // Regression: an auto column grew to fit a long file name in the Done card ("Saved …"), so the card got wider
    // than the window, the check mark moved off-screen and "Show in Explorer" was cut off.
    expect(rule('.overlay__center')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.card')).toContain('width: 100%');
  });

  it('long titles end in an ellipsis and long notes wrap', () => {
    expect(rule('.status__title')).toMatch(/text-overflow: ellipsis;.*white-space: nowrap/);
    expect(rule('.status__sub')).toContain('overflow-wrap: anywhere');
  });
});
