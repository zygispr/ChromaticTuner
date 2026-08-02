import { describe, expect, it } from 'vitest';

import { TunerSession } from '../src/tuning/session';
import { frequencyOf } from '../src/notes/frequency';
import type { TunerStatus } from '../src/types';
import { NoopWakeLock } from '../testing/noop-wake-lock';
import { ScriptedAudioSource } from '../testing/scripted-audio-source';
import { SAMPLE_RATE } from './fixtures/analyze';
import { sine } from './fixtures/signals';

function toneOf(midi: number, length = SAMPLE_RATE): Float32Array {
  return sine({ frequency: frequencyOf(midi, 440), sampleRate: SAMPLE_RATE, length });
}

function makeSession(source: ScriptedAudioSource, wakeLock = new NoopWakeLock()) {
  return new TunerSession({ audioSource: source, wakeLock, a4Hz: 440 });
}

describe('lifecycle', () => {
  it('starts idle', () => {
    const session = makeSession(new ScriptedAudioSource());
    expect(session.status.kind).toBe('idle');
  });

  it('transitions idle -> listening on start', async () => {
    const session = makeSession(new ScriptedAudioSource());
    await session.start();
    expect(session.status.kind).toBe('listening');
    await session.stop();
  });

  it('returns to idle on stop', async () => {
    const session = makeSession(new ScriptedAudioSource());
    await session.start();
    await session.stop();
    expect(session.status.kind).toBe('idle');
  });

  it('is idempotent on repeated start', async () => {
    const source = new ScriptedAudioSource();
    const session = makeSession(source);
    await session.start();
    await session.start();
    expect(session.status.kind).toBe('listening');
    await session.stop();
  });

  it('is idempotent on repeated stop', async () => {
    const source = new ScriptedAudioSource();
    const session = makeSession(source);
    await session.start();
    await session.stop();
    await session.stop();
    expect(session.status.kind).toBe('idle');
    expect(source.releaseCount).toBe(1);
  });

  it('releases the microphone on stop (FR-033)', async () => {
    const source = new ScriptedAudioSource();
    const session = makeSession(source);
    await session.start();
    expect(source.isRunning).toBe(true);
    await session.stop();
    expect(source.isRunning).toBe(false);
  });
});

describe('listening -> reading', () => {
  it('reaches reading once a confident pitch arrives', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);
    await session.start();

    expect(session.status.kind).toBe('listening');
    source.pump(12);

    expect(session.status.kind).toBe('reading');
    if (session.status.kind === 'reading') {
      expect(session.status.reading.midi).toBe(40);
    }
    await session.stop();
  });

  it('stays listening while only silence arrives', async () => {
    const source = new ScriptedAudioSource({ samples: new Float32Array(SAMPLE_RATE) });
    const session = makeSession(source);
    await session.start();

    source.pump(12);
    expect(session.status.kind).toBe('listening');
    await session.stop();
  });
});

describe('onStatusChange (guarantee S4)', () => {
  it('suppresses equal consecutive statuses so React does not re-render at 43 Hz', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);

    const kinds: string[] = [];
    session.onStatusChange((status: TunerStatus) => kinds.push(status.kind));

    await session.start();
    source.pump(30); // ~30 analyses, but the note never changes.
    await session.stop();

    // listening -> reading -> idle. Not one event per analysis.
    expect(kinds).toEqual(['listening', 'reading', 'idle']);
  });

  it('emits a new event when the detected note changes', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);

    const kinds: string[] = [];
    session.onStatusChange((status: TunerStatus) => kinds.push(status.kind));

    await session.start();
    source.pump(12);
    expect(kinds).toEqual(['listening', 'reading']);
    await session.stop();
  });

  it('returns a working unsubscribe', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);

    let calls = 0;
    const unsubscribe = session.onStatusChange(() => {
      calls += 1;
    });
    unsubscribe();

    await session.start();
    source.pump(12);
    await session.stop();

    expect(calls).toBe(0);
  });
});

describe('onReading (continuous channel)', () => {
  it('fires per analysis, far more often than onStatusChange', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);

    let readingEvents = 0;
    let statusEvents = 0;
    session.onReading(() => {
      readingEvents += 1;
    });
    session.onStatusChange(() => {
      statusEvents += 1;
    });

    await session.start();
    source.pump(30);
    await session.stop();

    expect(readingEvents).toBeGreaterThan(statusEvents * 3);
  });

  it('reports cents and clarity', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(45) });
    const session = makeSession(source);

    const samples: Array<{ cents: number; clarity: number }> = [];
    session.onReading((cents, clarity) => samples.push({ cents, clarity }));

    await session.start();
    source.pump(12);
    await session.stop();

    expect(samples.length).toBeGreaterThan(0);
    const last = samples[samples.length - 1]!;
    expect(Math.abs(last.cents)).toBeLessThan(2);
    expect(last.clarity).toBeGreaterThan(0.5);
  });

  it('returns a working unsubscribe', async () => {
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source);

    let calls = 0;
    const unsubscribe = session.onReading(() => {
      calls += 1;
    });
    unsubscribe();

    await session.start();
    source.pump(12);
    await session.stop();

    expect(calls).toBe(0);
  });
});

describe('reference pitch', () => {
  it('applies a change to subsequent readings', async () => {
    const source = new ScriptedAudioSource({
      samples: sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: SAMPLE_RATE * 2 }),
    });
    const session = makeSession(source);
    await session.start();

    source.pump(12);
    expect(session.status.kind).toBe('reading');
    if (session.status.kind === 'reading') {
      expect(session.status.reading.cents).toBeCloseTo(0, 0);
    }

    session.setReferencePitch(432);
    source.pump(12);
    if (session.status.kind === 'reading') {
      expect(session.status.reading.cents).toBeCloseTo(31.77, 0);
    }
    await session.stop();
  });
});

describe('failure surfaces as a status, never a swallowed error', () => {
  it('maps a denied permission to permission-denied', async () => {
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
    });
    const session = makeSession(source);
    await session.start();

    expect(session.status.kind).toBe('permission-denied');
    if (session.status.kind === 'permission-denied') {
      expect(session.status.canRetry).toBe(true);
    }
  });

  it('maps a missing device to no-microphone', async () => {
    const source = new ScriptedAudioSource({ failWith: { kind: 'no-microphone' } });
    const session = makeSession(source);
    await session.start();
    expect(session.status.kind).toBe('no-microphone');
  });

  it('does not reject out of start when the source fails', async () => {
    const source = new ScriptedAudioSource({ failWith: { kind: 'microphone-busy' } });
    const session = makeSession(source);
    await expect(session.start()).resolves.toBeUndefined();
  });
});

describe('wake lock lifecycle (T066, guarantee W2/S3)', () => {
  it('is held while active and released on stop', async () => {
    const lock = new NoopWakeLock();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, lock);

    await session.start();
    expect(lock.held).toBe(true);

    await session.stop();
    expect(lock.held).toBe(false);
  });

  it('stays held across the listening -> reading transition', async () => {
    // The lock is bound to "the tuner is active", not to a particular status.
    // Dropping and re-taking it on every note change would let the screen dim
    // in the gap.
    const lock = new NoopWakeLock();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, lock);

    await session.start();
    const acquiresWhileListening = lock.acquireCount;

    source.pump(12);
    expect(session.status.kind).toBe('reading');
    expect(lock.held).toBe(true);
    expect(lock.acquireCount).toBe(acquiresWhileListening);
    expect(lock.releaseCount).toBe(0);

    await session.stop();
  });

  it('is never taken when the microphone could not be opened', async () => {
    const lock = new NoopWakeLock();
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
    });
    const session = makeSession(source, lock);

    await session.start();

    expect(session.status.kind).toBe('permission-denied');
    expect(lock.held).toBe(false);
    expect(lock.acquireCount).toBe(0);
  });

  it('is released when the session drops into an error state', async () => {
    // A tuner showing "microphone busy" is not tuning anything, so holding the
    // screen awake is just draining the battery (FR-034).
    const lock = new NoopWakeLock();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, lock);

    await session.start();
    expect(lock.held).toBe(true);

    source.interrupt({ kind: 'microphone-busy' });
    await Promise.resolve();
    await Promise.resolve();

    expect(lock.held).toBe(false);
  });

  it('is taken again when the session recovers', async () => {
    const lock = new NoopWakeLock();
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, lock);

    await session.start();
    source.interrupt({ kind: 'microphone-busy' });
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.held).toBe(false);

    await session.retry();

    expect(session.status.kind).toBe('listening');
    expect(lock.held).toBe(true);
    await session.stop();
  });

  it('survives a platform with no wake lock at all (obligation W1)', async () => {
    const lock = new NoopWakeLock(true);
    const source = new ScriptedAudioSource({ samples: toneOf(40) });
    const session = makeSession(source, lock);

    await session.start();
    source.pump(12);

    // The tuner still works; only the screen behaviour degrades.
    expect(session.status.kind).toBe('reading');
    await session.stop();
  });
});
