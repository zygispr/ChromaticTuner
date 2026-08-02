import { describe, expect, it } from 'vitest';

import { frequencyOf } from '../src/notes/frequency';
import type { AudioSourceError } from '../src/ports/audio-source';
import { TunerSession } from '../src/tuning/session';
import type { TunerStatus } from '../src/types';
import { NoopWakeLock } from '../testing/noop-wake-lock';
import { ScriptedAudioSource } from '../testing/scripted-audio-source';
import { SAMPLE_RATE } from './fixtures/analyze';
import { sine } from './fixtures/signals';

/**
 * User Story 3 — every failure is a state with a way out.
 *
 * SC-014 allows **zero dead ends**, which is only checkable if two things hold
 * for every error the platform can produce: it surfaces as a `TunerStatus` the
 * UI can render (obligation A3), and the session either recovers by itself or
 * offers a retry that works (FR-029).
 */

/**
 * Let every already-resolved promise in the session's internal queue settle.
 *
 * An interruption hands work to the same serialising queue as start and stop,
 * so it lands several microtasks later. Draining the queue is deterministic —
 * unlike a timer — while still not depending on how many `await`s the
 * implementation happens to contain today.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/**
 * Deterministic stand-in for the host's timer.
 *
 * Retry is the one part of this story that is inherently time-based, and
 * Principle III forbids tests that depend on the wall clock. Scheduled work is
 * held here until a test fires it explicitly.
 */
function manualScheduler() {
  let pending: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];

  return {
    schedule: (callback: () => void, delayMs: number) => {
      const entry = { callback, delayMs, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    get pendingCount(): number {
      return pending.filter((entry) => !entry.cancelled).length;
    },
    get lastDelayMs(): number | null {
      return pending.length === 0 ? null : pending[pending.length - 1]!.delayMs;
    },
    /** Fire everything currently scheduled, as the host timer eventually would. */
    async runPending(): Promise<void> {
      const due = pending.filter((entry) => !entry.cancelled);
      pending = [];
      for (const entry of due) entry.callback();
      await flush();
    },
  };
}

type Scheduler = ReturnType<typeof manualScheduler>;

function makeSession(
  source: ScriptedAudioSource,
  scheduler: Scheduler,
  wakeLock = new NoopWakeLock()
) {
  return new TunerSession({
    audioSource: source,
    wakeLock,
    a4Hz: 440,
    scheduleRetry: scheduler.schedule,
  });
}

function toneOf(midi: number, length = SAMPLE_RATE): Float32Array {
  return sine({ frequency: frequencyOf(midi, 440), sampleRate: SAMPLE_RATE, length });
}

/** Every error the port can produce, with the status it must become (A3). */
const ERROR_CASES: Array<{
  name: string;
  error: AudioSourceError;
  expected: TunerStatus['kind'];
}> = [
  {
    name: 'permission denied, retryable',
    error: { kind: 'permission-denied', canRetry: true },
    expected: 'permission-denied',
  },
  {
    name: 'permission denied, blocked in settings',
    error: { kind: 'permission-denied', canRetry: false },
    expected: 'permission-denied',
  },
  { name: 'no microphone', error: { kind: 'no-microphone' }, expected: 'no-microphone' },
  { name: 'microphone busy', error: { kind: 'microphone-busy' }, expected: 'microphone-busy' },
  { name: 'unsupported platform', error: { kind: 'unsupported' }, expected: 'error' },
  {
    name: 'unknown failure',
    error: { kind: 'unknown', message: 'something went sideways' },
    expected: 'error',
  },
];

describe('every AudioSourceError maps to a status the UI can act on (T064, A3)', () => {
  for (const { name, error, expected } of ERROR_CASES) {
    it(`start() failing with ${name} becomes ${expected}`, async () => {
      const source = new ScriptedAudioSource({ failWith: error });
      const session = makeSession(source, manualScheduler());

      await session.start();

      expect(session.status.kind).toBe(expected);
    });

    it(`an interruption with ${name} becomes ${expected}`, async () => {
      const source = new ScriptedAudioSource({ samples: toneOf(40) });
      const session = makeSession(source, manualScheduler());
      await session.start();

      source.interrupt(error);
      await flush();

      expect(session.status.kind).toBe(expected);
    });
  }

  it('carries canRetry through, so the UI can word the recovery correctly', async () => {
    for (const canRetry of [true, false]) {
      const source = new ScriptedAudioSource({ failWith: { kind: 'permission-denied', canRetry } });
      const session = makeSession(source, manualScheduler());
      await session.start();

      expect(session.status.kind).toBe('permission-denied');
      if (session.status.kind === 'permission-denied') {
        expect(session.status.canRetry).toBe(canRetry);
      }
    }
  });

  it('keeps the unknown error message rather than replacing it with a generic one', async () => {
    const source = new ScriptedAudioSource({
      failWith: { kind: 'unknown', message: 'the audio graph exploded' },
    });
    const session = makeSession(source, manualScheduler());
    await session.start();

    expect(session.status.kind).toBe('error');
    if (session.status.kind === 'error') {
      expect(session.status.message).toContain('the audio graph exploded');
    }
  });

  it('releases the microphone when an interruption ends the session', async () => {
    // The OS recording indicator must clear. Holding a dead handle open is both
    // a privacy smell and what stops another app taking the device back.
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, manualScheduler());
    await session.start();

    source.interrupt({ kind: 'microphone-busy' });
    await flush();

    expect(source.isRunning).toBe(false);
  });

  it('has no dead ends: every error state can be retried back to listening', async () => {
    for (const { error } of ERROR_CASES) {
      const source = new ScriptedAudioSource({ failWith: error, samples: toneOf(40) });
      const session = makeSession(source, manualScheduler());
      await session.start();
      expect(session.status.kind).not.toBe('listening');

      // Whatever went wrong, the same door leads out of it (SC-014).
      source.setFailure(null);
      await session.retry();

      expect(session.status.kind).toBe('listening');
      await session.stop();
    }
  });
});

describe('automatic recovery without a restart (T065, FR-029, guarantee S2)', () => {
  it('returns to listening once permission is granted, with no second start() from the caller', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
      samples: toneOf(40),
    });
    const session = makeSession(source, scheduler);

    await session.start();
    expect(session.status.kind).toBe('permission-denied');
    expect(scheduler.pendingCount).toBe(1);

    // The user grants permission in the browser or OS. Nothing calls start().
    source.setFailure(null);
    await scheduler.runPending();

    expect(session.status.kind).toBe('listening');
    await session.stop();
  });

  it('returns to listening once a busy microphone is released', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, scheduler);
    await session.start();

    source.interrupt({ kind: 'microphone-busy' });
    await flush();
    expect(session.status.kind).toBe('microphone-busy');

    await scheduler.runPending();

    expect(session.status.kind).toBe('listening');
    await session.stop();
  });

  it('resumes producing readings after recovery, not merely the listening status', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ samples: toneOf(45) });
    const session = makeSession(source, scheduler);
    await session.start();

    source.interrupt({ kind: 'no-microphone' });
    await flush();
    await scheduler.runPending();

    source.pump(12);
    expect(session.status.kind).toBe('reading');
    if (session.status.kind === 'reading') {
      expect(session.status.reading.midi).toBe(45);
    }
    await session.stop();
  });

  it('keeps retrying while the failure persists', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ failWith: { kind: 'no-microphone' } });
    const session = makeSession(source, scheduler);

    await session.start();
    const afterStart = source.startCount;

    await scheduler.runPending();
    await scheduler.runPending();

    expect(source.startCount).toBeGreaterThan(afterStart);
    expect(session.status.kind).toBe('no-microphone');
    // Still a pending attempt: giving up silently would be a dead end.
    expect(scheduler.pendingCount).toBe(1);
  });

  it('does not retry a failure that retrying cannot fix', async () => {
    // An unsupported platform will still be unsupported in a second. Spinning
    // on it burns battery and never changes the answer.
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ failWith: { kind: 'unsupported' } });
    const session = makeSession(source, scheduler);

    await session.start();

    expect(session.status.kind).toBe('error');
    expect(scheduler.pendingCount).toBe(0);
  });

  it('stops retrying once the session is stopped', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ failWith: { kind: 'no-microphone' } });
    const session = makeSession(source, scheduler);

    await session.start();
    expect(scheduler.pendingCount).toBe(1);

    await session.stop();

    expect(scheduler.pendingCount).toBe(0);
    expect(session.status.kind).toBe('idle');
  });

  it('does not stack retries when several interruptions arrive at once', async () => {
    const scheduler = manualScheduler();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, scheduler);
    await session.start();

    source.interrupt({ kind: 'microphone-busy' });
    source.interrupt({ kind: 'microphone-busy' });
    source.interrupt({ kind: 'no-microphone' });
    await flush();

    expect(scheduler.pendingCount).toBe(1);
  });
});

describe('status changes that are easy to swallow', () => {
  it('re-publishes when only canRetry changes', async () => {
    // permission-denied → permission-denied with a different canRetry is a
    // genuinely different screen: one offers a retry button, the other sends
    // the user to settings. Comparing only `kind` would suppress it.
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
    });
    const session = makeSession(source, manualScheduler());

    const seen: TunerStatus[] = [];
    session.onStatusChange((status) => seen.push(status));

    await session.start();
    source.setFailure({ kind: 'permission-denied', canRetry: false });
    await session.retry();

    const denials = seen.filter((status) => status.kind === 'permission-denied');
    expect(denials).toHaveLength(2);
    expect(denials.map((s) => s.kind === 'permission-denied' && s.canRetry)).toEqual([true, false]);
  });

  it('re-publishes when only the error message changes', async () => {
    // Two different failures must not collapse into one event, or the second
    // one is invisible and the banner keeps showing the first one's cause.
    const source = new ScriptedAudioSource({
      failWith: { kind: 'unknown', message: 'first failure' },
    });
    const session = makeSession(source, manualScheduler());

    const messages: string[] = [];
    session.onStatusChange((status) => {
      if (status.kind === 'error') messages.push(status.message);
    });

    await session.start();
    source.setFailure({ kind: 'unknown', message: 'second failure' });
    await session.retry();

    expect(messages).toEqual(['first failure', 'second failure']);
  });

  it('adopts the sample rate the source actually reports (obligation A5)', async () => {
    // The platform substitutes rates freely. Using the requested one would put
    // every reading off by a fixed ratio — 48/44.1 is about 147 cents, more
    // than a semitone, so the tuner would name the wrong note entirely.
    const source = new ScriptedAudioSource({
      actualSampleRate: 48000,
      samples: sine({ frequency: 440, sampleRate: 48000, length: 48000 }),
    });
    const session = makeSession(source, manualScheduler(), new NoopWakeLock());

    await session.start();
    source.pump(16);

    expect(session.status.kind).toBe('reading');
    if (session.status.kind === 'reading') {
      // Detected correctly only if the analyzer was rebuilt at 48 kHz.
      expect(session.status.reading.midi).toBe(69);
      expect(Math.abs(session.status.reading.cents)).toBeLessThan(5);
    }
    await session.stop();
  });
});
