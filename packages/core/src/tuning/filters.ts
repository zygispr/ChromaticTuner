/**
 * The filter chain between the raw detector and the UI (research D7).
 *
 * All five stages, applied in order (contract core-api.md N4):
 *   1. Clarity gate      — reject anything that is not decisively a pitch
 *   2. Octave sanity     — reject a ±1200 cent jump that is a harmonic, not a note
 *   3. Median-of-5       — kill isolated outliers without the lag of a mean
 *   4. Name hysteresis   — the displayed note changes past the midpoint, not at it
 *   5. Hold-then-release — keep the last confident value briefly as a note decays
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
  /**
   * The note the UI should NAME, after hysteresis — not necessarily the note
   * nearest to `exactMidi`. Deviation must be measured against this, so the
   * name and the marker can never disagree about which note is being shown.
   */
  readonly displayedMidi: number;
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
  /** How far past the midpoint the pitch must go before the name changes. */
  readonly hysteresisCents?: number;
}

const DEFAULT_CLARITY_THRESHOLD = 0.9;
const DEFAULT_HOLD_MS = 400;
const DEFAULT_MEDIAN_WINDOW = 5;

/**
 * How far past a semitone midpoint the pitch must travel before the displayed
 * note changes (research D7 stage 4, data-model §5).
 *
 * Three cents is deliberately small: it has to be wider than the detector's
 * jitter on a string parked at a boundary — which the ±1 cent accuracy budget
 * bounds — while staying far below the ±5 cent in-tune tolerance, so a note can
 * never be named one thing and simultaneously read as in tune with another.
 *
 * The consequence is that reported deviation runs to ±(50 + this) rather than
 * ±50; the marker clamps at the ends of the line, which is honest, because the
 * pitch really is past the end of the note being displayed.
 */
export const NOTE_HYSTERESIS_CENTS = 3;

/**
 * Tolerance for calling a jump "exactly an octave" (research D7 stage 2).
 *
 * A harmonic lock puts the detector on precisely 2x or 0.5x the fundamental, so
 * in theory the jump is 1200.000 cents. In practice the comparison is against
 * the previous frame, one hop (~23 ms) earlier, during which a genuinely moving
 * pitch drifts a little and the detector's own error differs between a clean
 * frame and a harmonic-locked one. Ten cents covers both without being wide
 * enough to catch any interval a player would actually reach for.
 */
const OCTAVE_TOLERANCE_CENTS = 10;

/**
 * How much better clarity must be for an octave jump to be believed anyway.
 *
 * "Decisively better" has to mean something specific, or the check either never
 * fires or never lets a real octave change through.
 */
const OCTAVE_CLARITY_MARGIN = 0.05;

export class ReadingFilter {
  private readonly clarityThreshold: number;
  private readonly holdMs: number;
  private readonly medianWindow: number;
  private readonly hysteresisCents: number;

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

  /** Raw position of the previously accepted candidate, for the octave check. */
  private lastRawMidi = 0;

  /** The note currently being named. Null until the first confident reading. */
  private displayedMidi: number | null = null;

  /** Reused output; never allocated per frame (Principle V). */
  private readonly output = { frequency: 0, exactMidi: 0, clarity: 0, displayedMidi: 0 };

  constructor(options: FilterOptions = {}) {
    this.clarityThreshold = options.clarityThreshold ?? DEFAULT_CLARITY_THRESHOLD;
    this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
    this.medianWindow = options.medianWindow ?? DEFAULT_MEDIAN_WINDOW;
    this.hysteresisCents = options.hysteresisCents ?? NOTE_HYSTERESIS_CENTS;
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

    // Stage 2: octave sanity. A rejected candidate is treated as "nothing
    // arrived this frame", so a sustained one still gets through once the hold
    // expires — the check must not become a trap for a player who really did
    // move an octave.
    if (this.isOctaveError(candidate)) {
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
    this.lastRawMidi = candidate.exactMidi;
    this.lastClarity = candidate.clarity;
    this.lastAcceptedAt = now;
    this.hasConfident = true;

    // Stage 4: note-name hysteresis, applied to the SMOOTHED position so the
    // median's outlier rejection protects it too.
    this.updateDisplayedMidi(smoothed);

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
    this.lastRawMidi = 0;
    this.lastClarity = 0;
    this.displayedMidi = null;
  }

  /**
   * Stage 2: is this candidate a harmonic of the last reading rather than a new
   * note?
   *
   * The signature is a jump of almost exactly ±1200 cents — the low E's weak
   * fundamental letting the detector latch its second harmonic. A genuine
   * change of note by exactly an octave is possible, so clarity gets a vote:
   * a decisively clearer candidate is believed at once, and a merely equal one
   * still wins if it persists past the hold.
   */
  private isOctaveError(candidate: RawCandidate): boolean {
    if (!this.hasConfident) return false;

    const jumpCents = Math.abs(candidate.exactMidi - this.lastRawMidi) * 100;
    if (Math.abs(jumpCents - 1200) > OCTAVE_TOLERANCE_CENTS) return false;

    return candidate.clarity <= this.lastClarity + OCTAVE_CLARITY_MARGIN;
  }

  /**
   * Stage 4: move the displayed note only once the pitch is past the midpoint
   * by the hysteresis margin.
   *
   * Deviation from the displayed note therefore runs past ±50 before the name
   * flips, which is exactly the point: a string sitting on a boundary reads as
   * "very flat E" rather than alternating between E and D♯ several times a
   * second (FR-011). A jump larger than a semitone is not a boundary wobble —
   * it is a different string — so it is followed immediately.
   */
  private updateDisplayedMidi(exactMidi: number): void {
    const nearest = Math.round(exactMidi);

    if (this.displayedMidi === null) {
      this.displayedMidi = nearest;
      return;
    }

    if (nearest === this.displayedMidi) return;

    const deviationCents = Math.abs(exactMidi - this.displayedMidi) * 100;
    if (deviationCents > 50 + this.hysteresisCents) {
      this.displayedMidi = nearest;
    }
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
    this.output.displayedMidi = this.displayedMidi ?? Math.round(this.lastExactMidi);
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
