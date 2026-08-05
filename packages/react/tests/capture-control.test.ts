import { describe, expect, it } from 'vitest';

import type { TunerStatus } from '@chromatic-tuner/core';

import { captureControlState } from '../src/capture-control';

/**
 * Regression: a denied microphone offered "Stop listening" (FR-039).
 *
 * Pressing "Use the microphone" and then blocking the browser prompt left two
 * buttons on screen — the banner's "Try again", and a capture control still
 * labelled "Stop listening". The label is derived from the user's INTENT, which
 * survives a failed start, so the tuner claimed to hold a microphone that was
 * exactly the thing it had failed to open.
 *
 * Shared rather than decided in each app's organism for the same reason the
 * label copy is shared: the two platforms drifting onto opposite answers here
 * is invisible by eye and obvious to anyone who denies permission on both.
 */

const failures: readonly TunerStatus[] = [
  { kind: 'permission-denied', canRetry: true },
  { kind: 'permission-denied', canRetry: false },
  { kind: 'no-microphone' },
  { kind: 'microphone-busy' },
  { kind: 'error', message: 'This device cannot capture audio.' },
];

describe('captureControlState (FR-036, FR-039)', () => {
  it('reports not-capturing whenever the microphone could not be opened', () => {
    for (const status of failures) {
      expect(captureControlState(status, true).capturing).toBe(false);
    }
  });

  it('sends the press to retry, not to intent, while a failure is on screen', () => {
    // Flipping intent off here would be the wrong repair twice over: the user
    // pressed a control labelled "Start listening", and the microphone they
    // want is not open either way.
    for (const status of failures) {
      expect(captureControlState(status, true).retries).toBe(true);
    }
  });

  it('leaves the running states alone — this must not become a second stop button', () => {
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
      expect(captureControlState(status, true)).toEqual({ capturing: true, retries: false });
    }
  });

  it('still reads as capturing while the start is in flight', () => {
    // `idle` and `requesting-permission` with intent on mean "starting", which
    // the banner already says. Calling those not-capturing would flip the label
    // to "Start listening" for the first frames of every launch.
    expect(captureControlState({ kind: 'idle' }, true).capturing).toBe(true);
    expect(captureControlState({ kind: 'requesting-permission' }, true).capturing).toBe(true);
  });

  it('reports not-capturing when the user switched capture off', () => {
    expect(captureControlState({ kind: 'idle' }, false)).toEqual({
      capturing: false,
      retries: false,
    });
  });

  it('never asks a stopped control to retry — pressing it must start capture', () => {
    // Intent is off, so the failure on screen is stale. Retrying would open the
    // microphone the user has switched off, from a button that says it starts.
    for (const status of failures) {
      expect(captureControlState(status, false).retries).toBe(false);
    }
  });
});
