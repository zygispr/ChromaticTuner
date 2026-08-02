/**
 * Type scale.
 *
 * The note label is enormous on purpose: FR-017 requires it to be legible from
 * roughly one metre away, on a phone standing on a music stand. Everything else
 * is supporting information and is sized well below it.
 */
export const type = {
  /** The note name — the largest thing on the screen. */
  noteSize: 128,
  /** The signed cents readout. */
  centsSize: 32,
  /** Direction cue, status text, settings labels. */
  labelSize: 16,

  weightRegular: '400',
  weightMedium: '500',
  weightBold: '700',
} as const;

export type TypeToken = keyof typeof type;
