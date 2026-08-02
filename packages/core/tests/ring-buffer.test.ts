import { describe, expect, it } from 'vitest';

import { heapUsed } from './fixtures/heap';

import { RingBuffer } from '../src/dsp/ring-buffer';

function ramp(from: number, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = from + i;
  return out;
}

describe('RingBuffer', () => {
  it('reports its capacity and starts empty', () => {
    const ring = new RingBuffer(8);
    expect(ring.capacity).toBe(8);
    expect(ring.totalWritten).toBe(0);
    expect(ring.isFull).toBe(false);
  });

  it('is not full until capacity samples have been written', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(0, 7));
    expect(ring.isFull).toBe(false);
    ring.write(ramp(7, 1));
    expect(ring.isFull).toBe(true);
  });

  it('reads back the written samples in chronological order', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(0, 8));

    const out = new Float32Array(8);
    ring.readInto(out);
    expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps only the most recent samples once it wraps', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(0, 8));
    ring.write(ramp(8, 4)); // Wraps: 0-3 are evicted.

    const out = new Float32Array(8);
    ring.readInto(out);
    expect(Array.from(out)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('handles a write larger than its own capacity', () => {
    const ring = new RingBuffer(4);
    ring.write(ramp(0, 10)); // Only the last 4 can survive.

    const out = new Float32Array(4);
    ring.readInto(out);
    expect(Array.from(out)).toEqual([6, 7, 8, 9]);
  });

  it('stays correct across many wraps', () => {
    const ring = new RingBuffer(16);
    for (let i = 0; i < 100; i += 1) {
      ring.write(ramp(i * 3, 3));
    }
    const out = new Float32Array(16);
    ring.readInto(out);

    const expected = Array.from({ length: 16 }, (_, i) => 300 - 16 + i);
    expect(Array.from(out)).toEqual(expected);
    expect(ring.totalWritten).toBe(300);
  });

  it('handles a write that exactly straddles the wrap point', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(0, 6));
    ring.write(ramp(6, 4)); // 2 samples fit, 2 wrap around.

    const out = new Float32Array(8);
    ring.readInto(out);
    expect(Array.from(out)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('zero-pads the leading part of the window before it is full', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(1, 3));

    const out = new Float32Array(8);
    ring.readInto(out);
    // Chronological order with silence where no audio has arrived yet.
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 1, 2, 3]);
  });

  it('resets to empty', () => {
    const ring = new RingBuffer(8);
    ring.write(ramp(0, 8));
    ring.reset();

    expect(ring.totalWritten).toBe(0);
    expect(ring.isFull).toBe(false);
    const out = new Float32Array(8);
    ring.readInto(out);
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });

  it('rejects a read buffer that is not exactly the capacity', () => {
    const ring = new RingBuffer(8);
    expect(() => ring.readInto(new Float32Array(4))).toThrow();
  });

  it('does not retain the caller buffer — writes are copies', () => {
    const ring = new RingBuffer(4);
    const source = ramp(1, 4);
    ring.write(source);

    // Simulate the platform reusing its buffer (obligation A2).
    source.fill(99);

    const out = new Float32Array(4);
    ring.readInto(out);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('allocates nothing on write (Principle V)', () => {
    const ring = new RingBuffer(4096);
    const frames = new Float32Array(1024).fill(0.25);

    // Warm up, then measure. A per-write allocation of a 1024-sample array
    // would add ~40 MB over 10k writes; the threshold catches that decisively.
    for (let i = 0; i < 200; i += 1) ring.write(frames);
    const before = heapUsed();
    for (let i = 0; i < 10_000; i += 1) ring.write(frames);
    const growth = heapUsed() - before;

    expect(growth).toBeLessThan(5 * 1024 * 1024);
  });
});
