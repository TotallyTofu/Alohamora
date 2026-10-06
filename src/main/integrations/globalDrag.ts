// globalDrag.ts
import { screen } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { log } from '../log';
import { overlayDragEnd, overlayDragMode, overlayDragStart } from '../windows/overlayWindow';

let running = false;
let down: { x: number; y: number } | null = null;
let dragging = false;
let shift = false;
let alt = false;
let shown = false;

function update(): void {
  const mode = alt ? 'tools' : 'convert';
  if (dragging && shift && !shown) { shown = true; overlayDragStart(mode, screen.getCursorScreenPoint()); }
  else if (shown && dragging) overlayDragMode(mode);
}

export function startGlobalDrag(): void {
  if (running) return;
  running = true;
  uIOhook.on('mousedown', (e) => { if (e.button === 1) { down = { x: e.x, y: e.y }; dragging = false; } });
  uIOhook.on('mousemove', (e) => {
    if (down && !dragging && Math.hypot(e.x - down.x, e.y - down.y) > 12) { dragging = true; update(); }
  });
  uIOhook.on('mouseup', (e) => {
    if (e.button !== 1) return;
    down = null;
    dragging = false;
    if (shown) { shown = false; overlayDragEnd(); }
  });
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shift = true;
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) alt = true;
    update();
  });
  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shift = false;
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) alt = false;
    update();
  });
  uIOhook.start();
  log.info('Global drag wheel started');
}

export function stopGlobalDrag(): void {
  if (!running) return;
  uIOhook.removeAllListeners();
  uIOhook.stop();
  running = false;
  log.info('Global drag wheel stopped');
}
