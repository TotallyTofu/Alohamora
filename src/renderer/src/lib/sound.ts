import { api } from './api';
import { buildOutput, scheduleClick, scheduleTurn } from './soundSynth';

let enabled = true;
let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let lastTurn = 0;

/** Created on first use (never at start-up), and resumed if the system suspended it. */
function engine(): { ctx: AudioContext; out: AudioNode } {
  if (!ctx || !out) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    out = buildOutput(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out };
}

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

/** The key turns: played when the highlight moves to a different choice. Rate-limited so a fast sweep stays pleasant. */
export function playTurn(): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastTurn < 60) return;
  lastTurn = now;
  try {
    const e = engine();
    scheduleTurn(e.ctx, e.out, e.ctx.currentTime + 0.003, 0.94 + Math.random() * 0.12);
  } catch { /* no audio device: stay silent */ }
}

/** The lock clicks: played when a choice is made. */
export function playClick(): void {
  if (!enabled) return;
  try {
    const e = engine();
    scheduleClick(e.ctx, e.out, e.ctx.currentTime + 0.003);
  } catch { /* no audio device: stay silent */ }
}

/** WebKit (macOS, Linux) starts audio only after a user gesture: create/resume the context on the first click or key. */
function unlockOnFirstGesture(): void {
  const unlock = (): void => { try { engine(); } catch { /* no audio device: stay silent */ } };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

/** Follow the "Sound effects" setting (both windows call this once at start-up). */
export async function initSound(): Promise<void> {
  unlockOnFirstGesture();
  setSoundsEnabled((await api.getSettings()).sounds);
  api.onSettings((s) => setSoundsEnabled(s.sounds));
}
