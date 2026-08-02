/**
 * Fixed-capacity circular sample buffer.
 *
 * Holds the most recent `capacity` samples so the analyzer always has a full
 * window regardless of the hop size the platform delivers. Preallocated at
 * construction; `write` allocates nothing (Constitution Principle V).
 */
export class RingBuffer {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private written = 0;

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.buffer = new Float32Array(capacity);
  }

  /** Total samples ever written, including those since evicted. */
  get totalWritten(): number {
    return this.written;
  }

  /** Whether at least `capacity` samples have been written. */
  get isFull(): boolean {
    return this.written >= this.capacity;
  }

  /**
   * Copy `frames` in, evicting the oldest samples as needed.
   *
   * The caller's buffer is copied, never retained — the platforms are permitted
   * to reuse the array they hand us (obligation A2).
   */
  write(frames: Float32Array): void {
    const { capacity, buffer } = this;
    const length = frames.length;

    // A write larger than capacity can only leave its own tail behind.
    const start = length > capacity ? length - capacity : 0;

    for (let i = start; i < length; i += 1) {
      buffer[this.writeIndex] = frames[i]!;
      this.writeIndex = this.writeIndex + 1 === capacity ? 0 : this.writeIndex + 1;
    }

    this.written += length;
  }

  /**
   * Copy the most recent `capacity` samples into `out` in chronological order.
   *
   * Before the buffer has filled, the leading part of `out` is silence — which
   * is what the analyzer should see, rather than stale or wrapped garbage.
   */
  readInto(out: Float32Array): void {
    if (out.length !== this.capacity) {
      throw new Error(
        `readInto expects a buffer of exactly ${this.capacity} samples, got ${out.length}`
      );
    }

    const { capacity, buffer } = this;
    let readIndex = this.writeIndex;

    for (let i = 0; i < capacity; i += 1) {
      out[i] = buffer[readIndex]!;
      readIndex = readIndex + 1 === capacity ? 0 : readIndex + 1;
    }
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.written = 0;
  }
}
