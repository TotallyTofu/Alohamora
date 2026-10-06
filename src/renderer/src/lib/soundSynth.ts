/**
 * Synthesised lock-and-key sounds. Everything is generated from Web Audio nodes, so there are no audio files to ship and
 * nothing to download. The functions only schedule nodes on any BaseAudioContext, which makes them testable offline.
 *
 *  - scheduleTurn  ≈ 0.11 s  "tk-tk": a key's bit ratcheting past two tumblers (played when the highlight moves).
 *  - scheduleClick ≈ 0.22 s  "chk-clk": a deadbolt thunk, a metallic ring and the latch dropping (played when you choose).
 */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A quarter second of white noise from a fixed-seed generator, so every machine (and every test run) hears the same thing. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 0x80000000 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

const SILENCE = 0.0001;     // exponential ramps cannot reach exactly 0

/** Filtered noise with a near-instant attack and an exponential decay: the "tick" of metal on metal. */
function burst(ctx: BaseAudioContext, out: AudioNode, t: number, o: { dur: number; freq: number; q: number; gain: number; type?: BiquadFilterType }): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.frequency.value = o.freq;
  filter.Q.value = o.q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(SILENCE, t);
  amp.gain.exponentialRampToValueAtTime(o.gain, t + 0.0007);
  amp.gain.exponentialRampToValueAtTime(SILENCE, t + o.dur);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(out);
  src.start(t, 0, o.dur + 0.01);
}

/** A decaying sine: the metallic "ting" that rings after the strike. */
function ring(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, gain: number, dur: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(SILENCE, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.001);
  amp.gain.exponentialRampToValueAtTime(SILENCE, t + dur);
  osc.connect(amp);
  amp.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

/** A falling sine: the low "thunk" of the bolt hitting its housing. */
function thump(ctx: BaseAudioContext, out: AudioNode, t: number, from: number, to: number, gain: number, dur: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(SILENCE, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  amp.gain.exponentialRampToValueAtTime(SILENCE, t + dur);
  osc.connect(amp);
  amp.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

/** A make-up gain stage: filtered noise is quiet, so each sound is lifted as a whole after its envelopes are shaped. */
function level(ctx: BaseAudioContext, out: AudioNode, gain: number): AudioNode {
  const bus = ctx.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  return bus;
}

/** Key ratcheting past two tumblers. `pitch` (≈0.9–1.1) varies it slightly so repeated hovering never sounds mechanical. */
export function scheduleTurn(ctx: BaseAudioContext, out: AudioNode, t: number, pitch = 1): void {
  const bus = level(ctx, out, TURN_LEVEL);
  burst(ctx, bus, t, { dur: 0.014, freq: 2600 * pitch, q: 2.5, gain: 0.6 });
  thump(ctx, bus, t, 640 * pitch, 330 * pitch, 0.22, 0.028);                 // the small wooden "tock" under the tick
  ring(ctx, bus, t, 2100 * pitch, 0.03, 0.05);
  burst(ctx, bus, t + 0.036, { dur: 0.012, freq: 3300 * pitch, q: 2.5, gain: 0.45 });
  thump(ctx, bus, t + 0.036, 760 * pitch, 400 * pitch, 0.15, 0.024);
  ring(ctx, bus, t + 0.036, 2700 * pitch, 0.025, 0.045);
  burst(ctx, bus, t + 0.004, { dur: 0.075, freq: 1500 * pitch, q: 0.9, gain: 0.08 });     // the faint scrape underneath
}

/** Deadbolt thrown: thunk + strike + ring, then the latch drops a moment later. */
export function scheduleClick(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const bus = level(ctx, out, CLICK_LEVEL);
  thump(ctx, bus, t, 150, 62, 0.55, 0.11);
  burst(ctx, bus, t, { dur: 0.02, freq: 2600, q: 1, gain: 0.85 });
  ring(ctx, bus, t, 2350, 0.07, 0.16);
  ring(ctx, bus, t, 3480, 0.045, 0.12);
  ring(ctx, bus, t, 1180, 0.05, 0.14);
  const latch = t + 0.058;
  burst(ctx, bus, latch, { dur: 0.012, freq: 3300, q: 3, gain: 0.55 });
  ring(ctx, bus, latch, 2900, 0.04, 0.06);
  thump(ctx, bus, latch, 110, 70, 0.22, 0.05);
}

/** Overall lift of each sound (measured: the hover tick should peak near 0.3, the choose-click near 0.6). */
const TURN_LEVEL = 1.9;
const CLICK_LEVEL = 2.5;

/** Master chain: a little headroom and a gentle limiter so overlapping sounds can never clip. */
export function buildOutput(ctx: BaseAudioContext): AudioNode {
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  return master;
}

/** Longest tail (seconds) either sound can have; tests and the player use it to know when a sound is finished. */
export const MAX_SOUND_SECONDS = 0.3;
