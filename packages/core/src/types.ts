import type { AudioSourceError } from './ports/audio-source';

/** How accidentals are spelled in the UI (FR-023). */
export type AccidentalStyle = 'sharp' | 'flat';

/**
 * What is actually rendered. There are exactly two palettes and there always
 * were — `packages/tokens` has shipped both since 001.
 */
export type Appearance = 'light' | 'dark';

/**
 * What the user chose, and what is stored (data-model §1).
 *
 * `'system'` is a stored value in its own right, not a sentinel for "unset" and
 * not a snapshot of what the device said when it was picked. FR-119 turns on
 * exactly that distinction: someone who selects "Match device" in daylight must
 * still be matching the device that night, which is only true if the choice is
 * stored as the choice rather than as the light it resolved to.
 */
export type AppearancePreference = Appearance | 'system';

/**
 * The classification the entire UI keys off (data-model §4).
 *
 * Deliberately a closed set of four so that colour, marker position, and text
 * all derive from one value and cannot drift apart.
 */
export type TuningState = 'flat' | 'sharp' | 'in-tune' | 'no-reading';

/**
 * One live measurement (data-model §3).
 *
 * IMPORTANT: in the hot path this object is REUSED, not reallocated, per
 * Constitution Principle V. It is copied into an immutable snapshot exactly
 * once, at the `useTuner` boundary, before React ever sees it. Never retain a
 * reference to a PitchReading across frames.
 */
export interface PitchReading {
  /** Detected fundamental, in Hz. */
  frequency: number;
  /** Nearest note as a MIDI number. */
  midi: number;
  /** Signed deviation from that note, -50..+50. */
  cents: number;
  /** Detector confidence, 0-1. */
  clarity: number;
  /** Derived classification for the UI. */
  state: TuningState;
  /** Milliseconds since analysis started. */
  timestamp: number;
}

/**
 * The tuner's state machine (data-model §2).
 *
 * Modelled as a discriminated union so an unhandled state is a compile error —
 * this is how SC-014 ("zero dead ends") is enforced by the type system rather
 * than by diligence. Every terminal-looking state carries enough information
 * for the UI to offer a next step.
 */
export type TunerStatus =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'permission-denied'; canRetry: boolean }
  | { kind: 'no-microphone' }
  | { kind: 'microphone-busy' }
  | { kind: 'listening' }
  | { kind: 'reading'; reading: PitchReading }
  | { kind: 'error'; message: string };

/** Every status in which the tuner holds the microphone and the wake lock. */
export type ActiveStatusKind = 'listening' | 'reading';

/**
 * Whether the tuner is parked on a failure to open, or keep, the microphone.
 *
 * One definition because three separate decisions already turn on this exact
 * set, and they must agree: the banner explains a failure, `showsCaptureControl`
 * withholds the capture control while something else is offering the way out,
 * and `TunerSession.stop()` refuses to overwrite the reason with `idle`. They
 * did not agree, and the gap was a real defect — stopping on the way out of the
 * foreground replaced "Microphone access is blocked" with "Starting…" and put
 * back a control offering to stop a microphone that had never opened.
 *
 * Exhaustive on purpose: a new status kind must decide which side it falls on
 * rather than defaulting into "the microphone is fine".
 */
export function isFailureStatus(status: TunerStatus): boolean {
  switch (status.kind) {
    case 'permission-denied':
    case 'no-microphone':
    case 'microphone-busy':
    case 'error':
      return true;

    // `idle` and `requesting-permission` mean "starting", which is a state the
    // tuner passes THROUGH rather than one it is stuck on.
    case 'idle':
    case 'requesting-permission':
    case 'listening':
    case 'reading':
      return false;
  }
}

/**
 * Map a typed audio-source failure onto the status the UI should show.
 *
 * Obligation A3 and guarantee S1: every error surfaces as a state the user can
 * act on. Errors are never swallowed, and never reach the UI as a bare Error.
 */
export function statusForAudioError(error: AudioSourceError): TunerStatus {
  switch (error.kind) {
    case 'permission-denied':
      return { kind: 'permission-denied', canRetry: error.canRetry };
    case 'no-microphone':
      return { kind: 'no-microphone' };
    case 'microphone-busy':
      return { kind: 'microphone-busy' };
    case 'unsupported':
      return { kind: 'error', message: 'This device cannot capture audio.' };
    case 'unknown':
      return { kind: 'error', message: error.message };
  }
}
