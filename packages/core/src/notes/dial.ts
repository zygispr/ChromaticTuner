import { pitchClassOf } from './frequency';

/**
 * Where the dial's needle points, and how to keep it pointing there.
 *
 * Both functions are pure and platform-free, which is what lets the two apps
 * draw the same dial from the same numbers (FR-148, SC-071) and what lets the
 * geometry be asserted to the degree rather than eyeballed in a screenshot.
 *
 * Contract: specs/007-circular-tuner-display/contracts/tuner-display.md §1-§2
 */

const SEGMENTS = 12;

/** One chromatic segment, in degrees. Twelve of these make the full circle. */
export const DIAL_SEGMENT_DEGREES = 360 / SEGMENTS;

const CENTS_PER_SEMITONE = 100;
const FULL_TURN_DEGREES = 360;

/**
 * The needle's angle for a reading, in degrees CLOCKWISE FROM THE TOP (G1-G6).
 *
 * C is at the top and the dial ascends clockwise, so "speeding up" is a
 * sharpening string — the speedometer the feature was asked for.
 *
 * The angle is continuous in pitch rather than quantised to notes: the whole
 * value `pitchClass + cents/100` is scaled, so a pitch exactly halfway between
 * two notes lands exactly on the boundary between their segments, from
 * whichever side it is named (G6). That identity is not decoration — it is why
 * the needle can cross a boundary without a discontinuity.
 *
 * Deliberately takes `midi` and `cents` rather than a frequency. The reference
 * pitch has already been applied by `nearestNote` upstream, and taking a
 * frequency here would silently need `a4Hz` too, giving this function a second
 * reason to change.
 *
 * The result is not normalised into [0, 360). `cents` is within ±50 by
 * construction, so the raw range is -15 <= angle < 345 and a C just below
 * pitch is legitimately negative. Normalising here would destroy exactly the
 * information {@link unwrapDegrees} needs.
 */
export function dialAngleDegrees(midi: number, cents: number): number {
  return DIAL_SEGMENT_DEGREES * (pitchClassOf(midi) + cents / CENTS_PER_SEMITONE);
}

/**
 * The representative of `target` (mod 360) nearest `previous` (G7-G11).
 *
 * Every consumer of {@link dialAngleDegrees} MUST put its result through this
 * before rendering it, and MUST keep the accumulator between frames.
 *
 * Why: an angle is defined mod 360, but a CSS `transition` and a Reanimated
 * `withTiming` both interpolate between two NUMBERS. Crossing the top of the
 * dial takes the raw angle from 344.7 (B, +49 cents) to -14.7 (C, -49 cents) —
 * 0.6 degrees clockwise, expressed as 359.4 degrees anticlockwise. Without this,
 * the needle sweeps almost all the way round backwards to travel half a degree,
 * on every crossing, which is the defect FR-159 names.
 *
 * The result accumulates without bound and MUST NOT be folded back into
 * [0, 360) by the caller: a player sweeping E1 to E6 moves through five octaves,
 * so ~1800 degrees is a legitimate value (G11). `rotate(1800deg)` renders
 * exactly as `rotate(0deg)` does, and double precision has orders of magnitude
 * of headroom before the arithmetic stops being exact.
 */
export function unwrapDegrees(previous: number, target: number): number {
  const turns = Math.round((previous - target) / FULL_TURN_DEGREES);
  return target + turns * FULL_TURN_DEGREES;
}
