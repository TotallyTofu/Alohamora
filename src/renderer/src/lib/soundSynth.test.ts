import { describe, expect, it } from 'vitest';
import { MAX_SOUND_SECONDS, buildOutput, scheduleClick, scheduleTurn } from './soundSynth';

/** A recording stand-in for the Web Audio API: remembers every parameter automation and node lifetime. */
class Param {
  events: Array<{ kind: string; value: number; time: number }> = [];
  private v = 0;
  get value(): number { return this.v; }
  set value(x: number) { this.v = x; this.events.push({ kind: 'set', value: x, time: 0 }); }
  setValueAtTime(value: number, time: number): void { this.events.push({ kind: 'setValueAtTime', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number): void { this.events.push({ kind: 'ramp', value, time }); }
}

class FakeNode {
  gain = new Param(); frequency = new Param(); Q = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  type = ''; buffer: unknown = null; onended = null;
  starts: number[] = []; stops: number[] = []; connections: unknown[] = [];
  constructor(readonly kind: string) {}
  connect(to: unknown): unknown { this.connections.push(to); return to; }
  start(when: number, _offset?: number, duration?: number): void { this.starts.push(when); if (duration !== undefined) this.stops.push(when + duration); }
  stop(when: number): void { this.stops.push(when); }
}

class FakeContext {
  sampleRate = 48000;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  private make(kind: string): FakeNode { const n = new FakeNode(kind); this.nodes.push(n); return n; }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource(): FakeNode { return this.make('source'); }
  createBiquadFilter(): FakeNode { return this.make('filter'); }
  createGain(): FakeNode { return this.make('gain'); }
  createOscillator(): FakeNode { return this.make('osc'); }
  createDynamicsCompressor(): FakeNode { return this.make('compressor'); }
  asContext(): BaseAudioContext { return this as unknown as BaseAudioContext; }
}

function render(fn: (ctx: BaseAudioContext, out: AudioNode, t: number) => void, t0 = 1): { ctx: FakeContext; t0: number } {
  const ctx = new FakeContext();
  fn(ctx.asContext(), new FakeNode('out') as unknown as AudioNode, t0);
  return { ctx, t0 };
}

describe.each([['scheduleTurn', scheduleTurn], ['scheduleClick', scheduleClick]] as const)('%s', (_name, fn) => {
  const { ctx, t0 } = render(fn);
  const sources = ctx.nodes.filter((n) => n.kind === 'source' || n.kind === 'osc');
  // envelope gains are automated; the single "level" bus is a constant make-up gain
  const gains = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e.kind !== 'set'));
  const buses = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.every((e) => e.kind === 'set'));

  it('schedules several layers, each started and stopped', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const s of sources) {
      expect(s.starts).toHaveLength(1);
      expect(s.stops.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('never starts before it was asked to and is over within the maximum length', () => {
    for (const s of sources) {
      expect(s.starts[0]).toBeGreaterThanOrEqual(t0);
      for (const stop of s.stops) expect(stop - t0).toBeLessThanOrEqual(MAX_SOUND_SECONDS);
    }
  });

  it('has exactly one make-up level stage, with a sane gain, feeding the output', () => {
    expect(buses).toHaveLength(1);
    expect(buses[0].gain.value).toBeGreaterThanOrEqual(1);
    expect(buses[0].gain.value).toBeLessThanOrEqual(6);
    expect(buses[0].connections).toHaveLength(1);
  });

  it('keeps every envelope finite, below full scale, and decaying back to silence', () => {
    for (const g of gains) {
      const values = g.gain.events.map((e) => e.value);
      expect(values.every((v) => Number.isFinite(v) && v > 0 && v <= 1)).toBe(true);
      expect(Math.max(...values)).toBeLessThanOrEqual(0.9);
      expect(values[values.length - 1]).toBeLessThan(0.001);
      const times = g.gain.events.map((e) => e.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));       // automation must be in time order
    }
  });

  it('only uses audible, sane frequencies', () => {
    for (const n of ctx.nodes) {
      for (const e of [...n.frequency.events]) {
        if (e.value !== 0) { expect(e.value).toBeGreaterThan(40); expect(e.value).toBeLessThan(12000); }
      }
    }
  });
});

describe('sound character', () => {
  it('the choose-click is longer and louder than the hover tick', () => {
    const envelopes = (fn: typeof scheduleTurn): FakeNode[] => render(fn).ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e.kind !== 'set'));
    const turn = envelopes(scheduleTurn);
    const click = envelopes(scheduleClick);
    const peak = (nodes: FakeNode[]): number => Math.max(...nodes.flatMap((n) => n.gain.events.map((e) => e.value)));
    const end = (nodes: FakeNode[]): number => Math.max(...nodes.flatMap((n) => n.gain.events.map((e) => e.time))) - 1;
    expect(peak(click)).toBeGreaterThan(peak(turn));
    expect(end(click)).toBeGreaterThan(end(turn));
  });

  it('the pitch parameter shifts the hover tick', () => {
    const freqs = (pitch: number): number[] => {
      const ctx = new FakeContext();
      scheduleTurn(ctx.asContext(), new FakeNode('out') as unknown as AudioNode, 0, pitch);
      return ctx.nodes.filter((n) => n.kind === 'filter').map((n) => n.frequency.value);
    };
    const low = freqs(0.9);
    const high = freqs(1.1);
    low.forEach((f, i) => expect(high[i]).toBeGreaterThan(f));
  });

  it('buildOutput chains master gain → limiter → destination', () => {
    const ctx = new FakeContext();
    const master = buildOutput(ctx.asContext()) as unknown as FakeNode;
    expect(master.kind).toBe('gain');
    expect(master.gain.value).toBeLessThan(1);
    const limiter = master.connections[0] as FakeNode;
    expect(limiter.kind).toBe('compressor');
    expect(limiter.connections[0]).toBe(ctx.destination);
  });
});
