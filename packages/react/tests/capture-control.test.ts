import { describe, expect, it } from 'vitest';

import type { TunerStatus } from '@chromatic-tuner/core';

import { showsCaptureControl } from '../src/capture-control';

/**
 * Regression: a denied microphone offered "Stop listening" (FR-039).
 *
 * Pressing "Use the microphone" and then blocking the browser prompt left two
 * buttons on screen — the banner's "Try again", and a capture control still
 * labelled "Stop listening". The label is derived from the user's INTENT, which
 * survives a failed start, so the tuner claimed to hold a microphone that was
 * exactly the thing it had failed to open.
 *
 * The repair is to leave the failure screen one control rather than two saying
 * different things about the same microphone. Shared rather than decided in each
 * app's organism for the same reason the label copy is: the two platforms
 * drifting onto opposite answers here is invisible by eye and obvious to anyone
 * who denies permission on both.
 */

const failures: readonly TunerStatus[] = [
  { kind: 'permission-denied', canRetry: true },
  { kind: 'permission-denied', canRetry: false },
  { kind: 'no-microphone' },
  { kind: 'microphone-busy' },
  { kind: 'error', message: 'This device cannot capture audio.' },
];

describe('showsCaptureControl (FR-036, FR-039)', () => {
  it('withholds the control whenever the microphone could not be opened', () => {
    // The banner owns this screen: it explains the failure, gives the steps out
    // of it, and offers "Try again". A second button doing the same thing is the
    // one that has to go.
    for (const status of failures) {
      expect(showsCaptureControl(status, true)).toBe(false);
    }
  });

  it('shows the control while the microphone is open', () => {
    const running: readonly TunerStatus[] = [
      { kind: 'listening' },
      {
        kind: 'reading',
        reading: {
          frequency: 82.41,
          midi: 40,
          cents: 0,
          clarity: 0.99,
          state: 'in-tune',
          timestamp: 0,
        },
      },
    ];

    for (const status of running) {
      expect(showsCaptureControl(status, true)).toBe(true);
    }
  });

  it('shows the control while the start is in flight', () => {
    // `idle` and `requesting-permission` with intent on mean "starting", which
    // the banner already says. Withholding it here would make the control blink
    // out for the first frames of every launch.
    expect(showsCaptureControl({ kind: 'idle' }, true)).toBe(true);
    expect(showsCaptureControl({ kind: 'requesting-permission' }, true)).toBe(true);
  });

  it('always shows the control once the user has switched capture off', () => {
    // The stopped state is the one FR-036 exists for: this is the only way back
    // to a running tuner, so no status may take it away. Any failure still on
    // screen is stale — nothing is trying to open the microphone.
    expect(showsCaptureControl({ kind: 'idle' }, false)).toBe(true);

    for (const status of failures) {
      expect(showsCaptureControl(status, false)).toBe(true);
    }
  });
});
