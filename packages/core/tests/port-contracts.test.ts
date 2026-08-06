import { describe, expect, it } from 'vitest';

import { InMemoryPreferencesStore } from '../testing/in-memory-preferences-store';
import { NoopWakeLock } from '../testing/noop-wake-lock';
import { ScriptedAudioSource } from '../testing/scripted-audio-source';
import {
  ALL_AUDIO_SOURCE_ERRORS,
  audioSourceContract,
  preferencesStoreContract,
  wakeLockContract,
} from '../testing/port-contract-tests';
import { isAudioSourceError } from '../src/ports/audio-source';
import { statusForAudioError } from '../src/types';
import { sine } from './fixtures/signals';

// The doubles are the first implementations the contract suite runs against.
// T045 points the same suite at the real web and mobile adapters.

describe('AudioSource contract — ScriptedAudioSource', () => {
  for (const [name, check] of Object.entries(audioSourceContract)) {
    it(name, async () => {
      await check(
        () =>
          new ScriptedAudioSource({
            samples: sine({ frequency: 440, sampleRate: 44100, length: 4096 }),
          })
      );
    });
  }
});

describe('PreferencesStore contract — InMemoryPreferencesStore', () => {
  for (const [name, check] of Object.entries(preferencesStoreContract)) {
    it(name, async () => {
      await check(() => new InMemoryPreferencesStore());
    });
  }
});

describe('WakeLock contract — NoopWakeLock', () => {
  for (const [name, check] of Object.entries(wakeLockContract)) {
    it(name, async () => {
      await check(() => new NoopWakeLock());
    });
  }

  it('holds through an unsupported platform without rejecting', async () => {
    const lock = new NoopWakeLock(true);
    await lock.acquire();
    expect(lock.held).toBe(false); // Nothing was actually held...
    await lock.release(); // ...and releasing is still safe.
    expect(lock.releaseCount).toBe(1);
  });
});

describe('ScriptedAudioSource behaviour', () => {
  it('reports the actual sample rate over the requested one (obligation A5)', async () => {
    const source = new ScriptedAudioSource({ actualSampleRate: 48000 });
    const info = await source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {});
    expect(info.sampleRate).toBe(48000);
    await source.stop();
  });

  it('rejects with the configured typed error', async () => {
    const source = new ScriptedAudioSource({ failWith: { kind: 'no-microphone' } });
    await expect(source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {})).rejects.toEqual(
      { kind: 'no-microphone' }
    );
  });

  it('reuses one buffer across callbacks, so consumers must copy', async () => {
    const source = new ScriptedAudioSource({
      samples: sine({ frequency: 440, sampleRate: 44100, length: 4096 }),
    });
    const buffers: Float32Array[] = [];
    await source.start({ sampleRate: 44100, bufferLength: 1024 }, (frames) => {
      buffers.push(frames);
    });

    source.pump(3);
    expect(buffers).toHaveLength(3);
    // Same object every time — exactly what the real platforms may do.
    expect(buffers[0]).toBe(buffers[1]);
    expect(buffers[1]).toBe(buffers[2]);
    await source.stop();
  });

  it('advances through the scripted samples rather than repeating them', async () => {
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i += 1) samples[i] = i / samples.length;

    const source = new ScriptedAudioSource({ samples });
    const firstOfEachHop: number[] = [];
    await source.start({ sampleRate: 44100, bufferLength: 1024 }, (frames) => {
      firstOfEachHop.push(frames[0]!);
    });

    source.pump(2);
    expect(firstOfEachHop[0]).toBeCloseTo(0, 6);
    expect(firstOfEachHop[1]).toBeCloseTo(0.5, 6);
    await source.stop();
  });

  it('pads with silence once the script runs out', async () => {
    const source = new ScriptedAudioSource({ samples: new Float32Array(512).fill(0.5) });
    const hops: Float32Array[] = [];
    await source.start({ sampleRate: 44100, bufferLength: 512 }, (frames) => {
      hops.push(Float32Array.from(frames));
    });

    source.pump(2);
    expect(hops[0]!.every((v) => v === 0.5)).toBe(true);
    expect(hops[1]!.every((v) => v === 0)).toBe(true);
    await source.stop();
  });

  it('stops pumping once stopped, and counts the release', async () => {
    const source = new ScriptedAudioSource({ samples: new Float32Array(4096).fill(0.1) });
    let callbacks = 0;
    await source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {
      callbacks += 1;
    });

    source.pump(1);
    expect(source.isRunning).toBe(true);
    await source.stop();
    expect(source.releaseCount).toBe(1);

    source.pump(5);
    expect(callbacks).toBe(1); // No frames after stop (obligation A4).
  });

  it('notifies interrupt subscribers until they unsubscribe (obligation A6)', async () => {
    const source = new ScriptedAudioSource();
    const seen: string[] = [];
    const unsubscribe = source.onInterrupted((error) => seen.push(error.kind));

    source.interrupt({ kind: 'microphone-busy' });
    expect(seen).toEqual(['microphone-busy']);

    unsubscribe();
    source.interrupt({ kind: 'no-microphone' });
    expect(seen).toEqual(['microphone-busy']);
  });
});

describe('InMemoryPreferencesStore behaviour', () => {
  it('resolves null rather than throwing when the data is corrupt (obligation P1)', async () => {
    const store = new InMemoryPreferencesStore({
      a4Hz: 440,
      accidentalStyle: 'sharp',
      appearance: 'system',
      schemaVersion: 1,
    });
    store.corrupt = true;
    await expect(store.load()).resolves.toBeNull();
  });

  it('surfaces save failures without losing the in-memory value', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('quota exceeded');
    await expect(
      store.save({ a4Hz: 440, accidentalStyle: 'sharp', appearance: 'system', schemaVersion: 1 })
    ).rejects.toThrow('quota exceeded');
    expect(store.saveCount).toBe(1);
  });
});

describe('statusForAudioError', () => {
  it('maps every error variant to an actionable status — zero dead ends (SC-014)', () => {
    for (const error of ALL_AUDIO_SOURCE_ERRORS) {
      const status = statusForAudioError(error);
      expect(status.kind).not.toBe('idle');
      expect(status.kind).not.toBe('listening');
      expect(status.kind).not.toBe('reading');
    }
  });

  it('preserves whether a denied permission can be retried', () => {
    expect(statusForAudioError({ kind: 'permission-denied', canRetry: true })).toEqual({
      kind: 'permission-denied',
      canRetry: true,
    });
    expect(statusForAudioError({ kind: 'permission-denied', canRetry: false })).toEqual({
      kind: 'permission-denied',
      canRetry: false,
    });
  });

  it('maps device problems to their own distinct statuses', () => {
    expect(statusForAudioError({ kind: 'no-microphone' }).kind).toBe('no-microphone');
    expect(statusForAudioError({ kind: 'microphone-busy' }).kind).toBe('microphone-busy');
  });

  it('carries a human-readable message for unknown and unsupported failures', () => {
    const unknown = statusForAudioError({ kind: 'unknown', message: 'device on fire' });
    expect(unknown).toEqual({ kind: 'error', message: 'device on fire' });

    const unsupported = statusForAudioError({ kind: 'unsupported' });
    expect(unsupported.kind).toBe('error');
    expect(unsupported.kind === 'error' && unsupported.message.length).toBeGreaterThan(0);
  });
});

describe('isAudioSourceError (obligation A3 at the adapter boundary)', () => {
  it('accepts every variant the port defines', () => {
    for (const error of ALL_AUDIO_SOURCE_ERRORS) {
      expect(isAudioSourceError(error), JSON.stringify(error)).toBe(true);
    }
  });

  it('rejects anything that is not a typed port error', () => {
    // Adapters catch whatever the platform throws — DOMExceptions, strings,
    // undefined. The guard is what stops one of those being treated as a
    // TunerStatus and rendering a banner with no message in it.
    const impostors: unknown[] = [
      null,
      undefined,
      'permission-denied',
      42,
      [],
      new Error('permission-denied'),
      {},
      { kind: 'something-else' },
      { kind: 42 },
    ];

    for (const value of impostors) {
      expect(isAudioSourceError(value), JSON.stringify(value)).toBe(false);
    }
  });
});
