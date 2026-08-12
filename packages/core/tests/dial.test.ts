import { describe, expect, it } from 'vitest';

import { dialAngleDegrees, unwrapDegrees } from '../src/notes/dial';
import { MIDI_A0, MIDI_C8, pitchClassOf } from '../src/notes/frequency';

/**
 * Guarantees G1-G11, specs/007-circular-tuner-display/contracts/tuner-display.md.
 *
 * Read the hazard table in that feature's tasks.md before adding to this file.
 * The short version: C is the FIXED POINT of both defects this maths can have —
 * a mirrored dial and a sign-flipped cents term both agree with a correct one at
 * C, 0 cents. Every assertion here that matters is somewhere else on the circle.
 */

// Scientific pitch notation, the same convention octaveOf uses: middle C is C4.
const C4 = 60;
const D3 = 50;
const E4 = 64;
const G4 = 67;
const A4 = 69;
const B4 = 71;

/**
 * Signed shortest angular distance from `b` to `a`, in (-180, 180].
 *
 * Angles are equal as DIRECTIONS when this is zero, which is not the same as
 * being equal as numbers — 345 and -15 point the same way. Written out here
 * rather than reached for from the implementation, so a wrong constant in
 * `dial.ts` cannot make its own test agree with it.
 */
function shortestDifference(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

describe('dialAngleDegrees', () => {
  it('puts C at the top and A three-quarters of the way round (G2)', () => {
    expect(dialAngleDegrees(C4, 0)).toBeCloseTo(0, 10);

    // 270, NOT 90. This single assertion is what distinguishes a clockwise dial
    // from an anticlockwise one; every C-based assertion in this file passes on
    // both, which is why it cannot be the only one.
    expect(dialAngleDegrees(A4, 0)).toBeCloseTo(270, 10);
  });

  it('spaces four pitch classes evenly around the circle (G2)', () => {
    // Four rather than one: an implementation that ignored pitch class entirely
    // would satisfy any single-note test.
    expect(dialAngleDegrees(D3, 0)).toBeCloseTo(60, 10); // pitch class 2
    expect(dialAngleDegrees(E4, 0)).toBeCloseTo(120, 10); // 4
    expect(dialAngleDegrees(G4, 0)).toBeCloseTo(210, 10); // 7
    expect(dialAngleDegrees(B4, 0)).toBeCloseTo(330, 10); // 11
  });

  it('is exactly 30 degrees per semitone across a whole octave (G2)', () => {
    for (let semitone = 0; semitone < 12; semitone += 1) {
      expect(dialAngleDegrees(C4 + semitone, 0)).toBeCloseTo(semitone * 30, 10);
    }
  });

  it('gives the same angle to every octave of a note (G3)', () => {
    for (let midi = MIDI_A0; midi <= MIDI_C8 - 12; midi += 1) {
      expect(dialAngleDegrees(midi + 12, 0)).toBeCloseTo(dialAngleDegrees(midi, 0), 10);
      // With a deviation too — the octave must drop out of the whole function,
      // not just its integer part.
      expect(dialAngleDegrees(midi + 12, 17.5)).toBeCloseTo(dialAngleDegrees(midi, 17.5), 10);
    }
  });

  it('displaces 0.3 degrees per cent, sharp clockwise (G4)', () => {
    for (const midi of [C4, D3, A4, B4]) {
      const centre = dialAngleDegrees(midi, 0);

      // Sharp INCREASES the angle. Reversed, this is the mirrored dial the
      // speedometer analogy forbids: speeding up must move clockwise.
      expect(dialAngleDegrees(midi, 25) - centre).toBeCloseTo(7.5, 10);
      expect(dialAngleDegrees(midi, 50) - centre).toBeCloseTo(15, 10);

      // Flat DECREASES it.
      expect(dialAngleDegrees(midi, -25) - centre).toBeCloseTo(-7.5, 10);
      expect(dialAngleDegrees(midi, -50) - centre).toBeCloseTo(-15, 10);
    }
  });

  it('is linear in cents, not merely signed correctly (G4)', () => {
    // A step function that moved the needle to +15 for anything sharp would
    // satisfy the assertions above at their endpoints.
    for (let cents = -50; cents <= 50; cents += 1) {
      expect(dialAngleDegrees(A4, cents) - 270).toBeCloseTo(0.3 * cents, 10);
    }
  });

  it('never leaves the segment of the note it is naming (G5)', () => {
    for (let midi = MIDI_A0; midi <= MIDI_C8; midi += 1) {
      const centre = 30 * pitchClassOf(midi);
      for (const cents of [-50, -37.4, -12, 0, 12, 37.4, 50]) {
        // Half a segment either side, which is the whole range nearestNote can
        // produce. A needle outside this would be pointing at a note the readout
        // is not naming.
        expect(Math.abs(dialAngleDegrees(midi, cents) - centre)).toBeLessThanOrEqual(15 + 1e-9);
      }
    }
  });

  it('points one direction at the boundary, from either side (G6)', () => {
    for (let midi = MIDI_A0; midi < MIDI_C8; midi += 1) {
      const fromBelow = dialAngleDegrees(midi, 50);
      const fromAbove = dialAngleDegrees(midi + 1, -50);
      expect(shortestDifference(fromBelow, fromAbove)).toBeCloseTo(0, 8);
    }
  });

  it('expresses the B/C boundary as two raw values one turn apart (G6)', () => {
    // The reason G6 above is stated modulo 360 rather than as equality, and it
    // is not a wrinkle — it is the whole case unwrapDegrees exists for.
    //
    // Eleven of the twelve boundaries have identical raw values from both
    // sides: C +50 and C# -50 are both 15. The twelfth wraps. B +50 is 345 and
    // C -50 is -15: the same direction, 360 apart as numbers. A renderer handed
    // these two in consecutive frames, with no unwrapping, animates a full turn
    // backwards.
    expect(dialAngleDegrees(C4, 50)).toBeCloseTo(15, 10);
    expect(dialAngleDegrees(C4 + 1, -50)).toBeCloseTo(15, 10);

    expect(dialAngleDegrees(B4, 50)).toBeCloseTo(345, 10);
    expect(dialAngleDegrees(B4 + 1, -50)).toBeCloseTo(-15, 10);
    expect(dialAngleDegrees(B4, 50) - dialAngleDegrees(B4 + 1, -50)).toBeCloseTo(360, 10);
  });

  it('is total and pure (G1)', () => {
    const inputs: Array<[number, number]> = [
      [MIDI_A0, -50],
      [C4, 0],
      [MIDI_C8, 50],
      [0, 0],
      [-5, 13],
      [200, -13],
    ];

    for (const [midi, cents] of inputs) {
      const once = dialAngleDegrees(midi, cents);
      expect(Number.isFinite(once)).toBe(true);
      // Same inputs, same output — no accumulated state hiding inside.
      expect(dialAngleDegrees(midi, cents)).toBe(once);
    }
  });
});

describe('unwrapDegrees', () => {
  it('takes the short way across the top of the dial (G10)', () => {
    // B +49 cents to C -49 cents: 0.6 degrees clockwise, expressed by the raw
    // angles as 359.4 degrees anticlockwise. THIS is the assertion the whole
    // function exists for — an identity implementation passes everything that
    // does not wrap.
    expect(unwrapDegrees(344.7, -14.7)).toBeCloseTo(345.3, 10);

    // And the same crossing downwards: 0.6 degrees anticlockwise from -14.7 is
    // -15.3, NOT 344.7 and not -14.7. Written the wrong way round the first
    // time, and caught by running it — the expected value must be the ANSWER,
    // and it is easy to type the input again when the two are 0.6 apart.
    expect(unwrapDegrees(-14.7, 344.7)).toBeCloseTo(-15.3, 10);
  });

  it('keeps the result congruent to the target (G8)', () => {
    const cases: Array<[number, number]> = [
      [0, 10],
      [344.7, -14.7],
      [-14.7, 344.7],
      [1800, 12],
      [-720, 359],
      [17, 17],
    ];

    for (const [previous, target] of cases) {
      const result = unwrapDegrees(previous, target);
      // Congruence alone is satisfied by the identity, so this pins direction
      // while the test above pins distance. Both are required; neither is a
      // test of anything on its own.
      const difference = ((result - target) % 360) + 360;
      expect(difference % 360).toBeCloseTo(0, 8);
    }
  });

  it('never moves more than half a turn (G9)', () => {
    for (let previous = -400; previous <= 400; previous += 7) {
      for (let target = -180; target <= 540; target += 11) {
        const result = unwrapDegrees(previous, target);
        expect(Math.abs(result - previous)).toBeLessThanOrEqual(180 + 1e-9);
      }
    }
  });

  it('accumulates through a five-octave sweep without renormalising (G11)', () => {
    // E1 to E6 is five octaves, and an octave is one full turn of the dial. The
    // accumulator must reach ~1800 degrees: anything that folds the result back
    // into [0, 360) breaks the animation at every wrap it hides.
    let angle = 0;
    let previous = 0;

    for (let step = 1; step <= 5 * 360; step += 1) {
      const raw = step % 360;
      angle = unwrapDegrees(angle, raw);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }

    expect(angle).toBeCloseTo(1800, 6);
  });

  it('is total and pure (G7)', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [359.9, 0.1],
      [-1000, 1000],
      [1e6, -1e6],
    ];

    for (const [previous, target] of cases) {
      const once = unwrapDegrees(previous, target);
      expect(Number.isFinite(once)).toBe(true);
      expect(unwrapDegrees(previous, target)).toBe(once);
    }
  });
});
