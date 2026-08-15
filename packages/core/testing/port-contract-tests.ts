import type { AudioSource, AudioSourceError } from '../src/ports/audio-source';
import { isAudioSourceError } from '../src/ports/audio-source';
import type { PreferencesStore } from '../src/ports/preferences-store';
import type { WakeLock } from '../src/ports/wake-lock';

/**
 * Shared, adapter-agnostic contract suite.
 *
 * Covers obligations A1-A7, P1-P4 and W1-W3 from
 * specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §5.
 *
 * Deliberately imports NO test runner. `packages/*` and `apps/web` run under
 * Vitest while `apps/mobile` runs under Jest, so a suite tied to either could
 * not be pointed at both real adapters (T045). Instead each check is a plain
 * async function that throws on violation; the caller wraps them in whatever
 * `it()` it has.
 *
 * Usage:
 *
 * ```ts
 * for (const [name, check] of Object.entries(audioSourceContract)) {
 *   it(name, () => check(() => new MyAudioSource()));
 * }
 * ```
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract violation: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Contract violation: ${message} (expected ${expected}, got ${actual})`);
  }
}

/**
 * Compare a whole stored record, field for field, in both directions.
 *
 * `assertEqual` cannot do this — it is `!==`, so two structurally identical
 * records fail it. That matters more than it sounds: a round-trip check written
 * as a few `assertEqual`s on named fields passes on an adapter that silently
 * DROPS every field the check does not happen to name, which is exactly how a
 * newly added preference gets lost. Comparing the key sets in both directions
 * catches a dropped field and an invented one.
 */
function assertSameRecord(actualValue: object, expectedValue: object, message: string): void {
  // Widened here rather than in the signature: an interface without an index
  // signature is not assignable to Record<string, unknown>, and every caller
  // passes exactly that.
  const actual = actualValue as Record<string, unknown>;
  const expected = expectedValue as Record<string, unknown>;

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();

  if (actualKeys.join(',') !== expectedKeys.join(',')) {
    throw new Error(
      `Contract violation: ${message} (expected keys ${expectedKeys.join(',')}, got ${actualKeys.join(',')})`
    );
  }

  for (const key of expectedKeys) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Contract violation: ${message} (${key}: expected ${String(expected[key])}, got ${String(actual[key])})`
      );
    }
  }
}

async function expectRejection(promise: Promise<unknown>, message: string): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error(`Contract violation: ${message}`);
}

export type AudioSourceFactory = () => AudioSource;
export type PreferencesStoreFactory = () => PreferencesStore;
export type WakeLockFactory = () => WakeLock;

const DEFAULT_CONFIG = { sampleRate: 44100, bufferLength: 1024 } as const;

export const audioSourceContract: Record<string, (factory: AudioSourceFactory) => Promise<void>> = {
  'A1: delivers mono samples within -1.0..1.0': async (factory) => {
    const source = factory();
    const seen: number[] = [];
    await source.start(DEFAULT_CONFIG, (frames) => {
      for (let i = 0; i < frames.length; i += 1) seen.push(frames[i]!);
    });
    for (const sample of seen) {
      assert(Number.isFinite(sample), 'samples must be finite');
      assert(sample >= -1 && sample <= 1, `sample ${sample} outside -1.0..1.0`);
    }
    await source.stop();
  },

  'A2: frames buffer is only valid during the callback': async (factory) => {
    const source = factory();
    let firstBuffer: Float32Array | null = null;
    let sawSecondCallback = false;

    await source.start(DEFAULT_CONFIG, (frames) => {
      if (firstBuffer === null) {
        firstBuffer = frames;
      } else {
        sawSecondCallback = true;
      }
    });

    // The adapter is ALLOWED to hand back the same buffer object every time.
    // This check does not forbid that; it documents that consumers must copy.
    if (sawSecondCallback) {
      assert(firstBuffer !== null, 'a buffer should have been delivered');
    }
    await source.stop();
  },

  'A3: start rejects with a typed AudioSourceError, never a bare Error': async (factory) => {
    const source = factory();
    // Only meaningful for sources configured to fail; a healthy source starts.
    try {
      await source.start(DEFAULT_CONFIG, () => {});
      await source.stop();
    } catch (error) {
      assert(
        isAudioSourceError(error),
        `rejection must be an AudioSourceError, got ${JSON.stringify(error)}`
      );
    }
  },

  'A4: stop releases the microphone and is idempotent': async (factory) => {
    const source = factory();
    await source.start(DEFAULT_CONFIG, () => {});
    await source.stop();
    await source.stop(); // Must not throw.
  },

  'A5: reports the actual sample rate, not the requested one': async (factory) => {
    const source = factory();
    const info = await source.start(DEFAULT_CONFIG, () => {});
    assert(
      typeof info.sampleRate === 'number' && info.sampleRate > 0,
      'must report a positive sample rate'
    );
    await source.stop();
  },

  'A6: onInterrupted returns a working unsubscribe': async (factory) => {
    const source = factory();
    let calls = 0;
    const unsubscribe = source.onInterrupted(() => {
      calls += 1;
    });
    assertEqual(typeof unsubscribe, 'function', 'onInterrupted must return an unsubscribe');
    unsubscribe();
    assertEqual(calls, 0, 'handler must not fire on subscribe');
    await source.stop();
  },

  'A7: starting twice without stopping rejects': async (factory) => {
    const source = factory();
    await source.start(DEFAULT_CONFIG, () => {});
    const error = await expectRejection(
      source.start(DEFAULT_CONFIG, () => {}),
      'second start must reject rather than open a second stream'
    );
    assert(isAudioSourceError(error), 'the rejection must still be a typed AudioSourceError');
    await source.stop();
  },
};

export const preferencesStoreContract: Record<
  string,
  (factory: PreferencesStoreFactory) => Promise<void>
> = {
  'P1: load resolves null for absent data rather than rejecting': async (factory) => {
    const store = factory();
    await store.clear();
    const loaded = await store.load();
    assertEqual(loaded, null, 'load must resolve null when nothing is stored');
  },

  'P1: round-trips a saved value': async (factory) => {
    const store = factory();
    const prefs = {
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'dial',
      schemaVersion: 1,
    } as const;
    await store.save(prefs);
    const loaded = await store.load();
    assert(loaded !== null, 'a saved value must load back');
    assertSameRecord(
      loaded,
      prefs,
      'the whole record must round-trip, not just the fields we name'
    );
  },

  /**
   * V41 — every appearance survives storage, on every adapter.
   *
   * Separate from the round-trip above because the failure it catches is
   * value-specific rather than shape-specific: an adapter that serialises
   * through a hand-written mapping keeps whichever value the other test used
   * and loses the rest. Each of the three is stored and read back on its own.
   */
  'P1: every appearance value round-trips (M5, V41)': async (factory) => {
    for (const appearance of ['light', 'dark', 'system'] as const) {
      const store = factory();
      await store.clear();

      const prefs = {
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance,
        tunerDisplay: 'line',
        schemaVersion: 1,
      } as const;
      await store.save(prefs);

      const loaded = await store.load();
      assert(loaded !== null, `a record with appearance '${appearance}' must load back`);
      assertSameRecord(loaded, prefs, `the record carrying appearance '${appearance}' changed`);
    }
  },

  /**
   * G19 — every tuner display survives storage, on every adapter.
   *
   * Separate from the round-trip above for the same reason the appearance
   * check is: the failure it catches is value-specific rather than
   * shape-specific. An adapter serialising through a hand-written mapping
   * keeps whichever value the other check happened to use and silently loses
   * the other, and the user's choice would then survive a reload only if they
   * happened to pick the one the test used.
   */
  'P1: every tuner display value round-trips (G19, FR-150)': async (factory) => {
    for (const tunerDisplay of ['line', 'dial'] as const) {
      const store = factory();
      await store.clear();

      const prefs = {
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'system',
        tunerDisplay,
        schemaVersion: 1,
      } as const;
      await store.save(prefs);

      const loaded = await store.load();
      assert(loaded !== null, `a record with tunerDisplay '${tunerDisplay}' must load back`);
      assertSameRecord(loaded, prefs, `the record carrying tunerDisplay '${tunerDisplay}' changed`);
    }
  },

  'P4: clear removes the stored value': async (factory) => {
    const store = factory();
    await store.save({
      a4Hz: 440,
      accidentalStyle: 'sharp',
      appearance: 'system',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });
    await store.clear();
    assertEqual(await store.load(), null, 'clear must remove the stored value');
  },
};

export const wakeLockContract: Record<string, (factory: WakeLockFactory) => Promise<void>> = {
  'W1: acquire and release are idempotent': async (factory) => {
    const lock = factory();
    await lock.acquire();
    await lock.acquire();
    await lock.release();
    await lock.release();
  },

  'W1: release is safe when no lock is held': async (factory) => {
    const lock = factory();
    await lock.release();
  },

  'W1: neither method rejects on an unsupported platform': async (factory) => {
    const lock = factory();
    await lock.acquire();
    await lock.release();
  },
};

/** Every error variant, so callers can prove each maps to a distinct status. */
export const ALL_AUDIO_SOURCE_ERRORS: readonly AudioSourceError[] = [
  { kind: 'permission-denied', canRetry: true },
  { kind: 'permission-denied', canRetry: false },
  { kind: 'no-microphone' },
  { kind: 'microphone-busy' },
  { kind: 'unsupported' },
  { kind: 'unknown', message: 'boom' },
];
