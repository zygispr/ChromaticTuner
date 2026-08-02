/**
 * Motion durations, in milliseconds.
 *
 * Advisory, not mandatory: components MUST fall back to 0 ms under the
 * platform's reduced-motion setting (FR-016, guarantee T4).
 *
 * `markerMs` is deliberately short. The marker must read as tracking the peg in
 * real time; anything longer starts to feel like lag rather than smoothing.
 */
export const motion = {
  /** Marker position easing. Kept under one analysis hop (~23 ms) x 4. */
  markerMs: 90,
  /** Tuning-state colour cross-fade. */
  colorMs: 180,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export type MotionToken = keyof typeof motion;
