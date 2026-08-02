/**
 * The filter chain between the raw detector and the UI (research D7).
 *
 * Stages implemented here in US1:
 *   1. Clarity gate      — reject anything that is not decisively a pitch
 *   3. Median-of-5       — kill isolated outliers without the lag of a mean
 *   5. Hold-then-release — keep the last confident value briefly as a note decays
 *
 * Stages 2 (octave sanity) and 4 (note-name hysteresis) land in US2 (T060/T061).
 *
 * Every stage is a pure operation over a small state record, so the tricky
 * behaviours are unit-testable without any audio hardware — which is what makes
 * Principle III's coverage requirement achievable here.
 */

export interface RawCandidate {
  /** Detected fundamental in Hz. */
  readonly frequency: number;
  /** Real-valued MIDI position; the fractional part is the deviation. */
  readonly exactMidi: number;
  /** Detector confidence, 0-1. */
  readonly clarity: number;
}

export interface FilteredReading {
  readonly frequency: number;
  readonly exactMidi: number;
  readonly clarity: number;
}

export interface FilterOptions {
  /**
   * Minimum MPM clarity to accept a candidate. Below this the signal is noise,
   * silence, or several strings at once — all cases where the honest answer is
   * "no reading" rather than a guess (FR-012).
   */
  readonly clarityThreshold?: number;
  /** How long to keep showing the last confident value after the signal dies. */
  readonly holdMs?: number;
  /** Median window size. Odd, so there is a true middle element. */
  readonly medianWindow?: number;
}

const DEFAULT_CLARITY_THRESHOLD = 0.9;
const DEFAULT_HOLD_MS = 400;
const DEFAULT_MEDIAN_WINDOW = 5;

export class ReadingFilter {
  private readonly clarityThreshold: number;
  private readonly holdMs: number;
  private readonly medianWindow: number;

  /** Recent accepted positions, in real-valued MIDI. Preallocated. */
  private readonly history: Float64Array;
  private historyCount = 0;
  private historyIndex = 0;
  /** Scratch for the median, so sorting allocates nothing per frame. */
  private readonly scratch: Float64Array;

  private lastFrequency = 0;
  private lastExactMidi = 0;
  private lastClarity = 0;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;
  private hasConfident = false;

  /** Reused output; never allocated per frame (Principle V). */
  private readonly output = { frequency: 0, exactMidi: 0, clarity: 0 };

  constructor(options: FilterOptions = {}) {
    this.clarityThreshold = options.clarityThreshold ?? DEFAULT_CLARITY_THRESHOLD;
    this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
    this.medianWindow = options.medianWindow ?? DEFAULT_MEDIAN_WINDOW;
    this.history = new Float64Array(this.medianWindow);
    this.scratch = new Float64Array(this.medianWindow);
  }

  /**
   * Run one candidate through the chain.
   *
   * @param candidate the raw detector output, or null when it found nothing
   * @param now milliseconds since analysis started
   * @returns the filtered reading, or null when there is nothing to show.
   *          The returned object is REUSED — copy it if you need to retain it.
   */
  accept(candidate: RawCandidate | null, now: number): FilteredReading | null {
    // Stage 1: clarity gate.
    if (candidate === null || candidate.clarity < this.clarityThreshold) {
      return this.holdOrRelease(now);
    }

    // Stage 3: median-of-N over the real-valued MIDI position. Working in MIDI
    // rather than cents means a candidate that crosses a semitone boundary is
    // still a small numeric step, so the median behaves sensibly there.
    this.history[this.historyIndex] = candidate.exactMidi;
    this.historyIndex = (this.historyIndex + 1) % this.medianWindow;
    if (this.historyCount < this.medianWindow) this.historyCount += 1;

    const smoothed = this.median();

    this.lastFrequency = candidate.frequency;
    this.lastExactMidi = smoothed;
    this.lastClarity = candidate.clarity;
    this.lastAcceptedAt = now;
    this.hasConfident = true;

    return this.emit();
  }

  reset(): void {
    this.history.fill(0);
    this.historyCount = 0;
    this.historyIndex = 0;
    this.hasConfident = false;
    this.lastAcceptedAt = Number.NEGATIVE_INFINITY;
    this.lastFrequency = 0;
    this.lastExactMidi = 0;
    this.lastClarity = 0;
  }

  /** Stage 5: keep the last confident value briefly, then admit we lost it. */
  private holdOrRelease(now: number): FilteredReading | null {
    if (!this.hasConfident) return null;
    if (now - this.lastAcceptedAt > this.holdMs) {
      this.reset();
      return null;
    }
    return this.emit();
  }

  private emit(): FilteredReading {
    this.output.frequency = this.lastFrequency;
    this.output.exactMidi = this.lastExactMidi;
    this.output.clarity = this.lastClarity;
    return this.output;
  }

  private median(): number {
    const count = this.historyCount;
    const scratch = this.scratch;
    for (let i = 0; i < count; i += 1) scratch[i] = this.history[i]!;

    // Insertion sort over at most 5 elements: allocation-free and faster than
    // Array.prototype.sort at this size.
    for (let i = 1; i < count; i += 1) {
      const value = scratch[i]!;
      let j = i - 1;
      while (j >= 0 && scratch[j]! > value) {
        scratch[j + 1] = scratch[j]!;
        j -= 1;
      }
      scratch[j + 1] = value;
    }

    return scratch[count >> 1]!;
  }
}
