import { describe, expect, it } from 'vitest';

import {
  A4_DEFAULT_HZ,
  A4_MAX_HZ,
  A4_MIN_HZ,
  DEFAULT_PREFERENCES,
  PREFERENCES_SCHEMA_VERSION,
  clampA4Hz,
  isNonStandardReference,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from '../src/preferences';
import { InMemoryPreferencesStore } from '../testing/in-memory-preferences-store';

/**
 * User Story 4 — the two persisted settings.
 *
 * The whole point of this module is that it is TOTAL: every possible input,
 * including whatever a hand-edited localStorage entry contains, produces a
 * usable set of preferences rather than an exception. A broken preference must
 * never block tuning (obligation P1), so "throws" is a failing outcome
 * everywhere below.
 */

describe('clampA4Hz (guarantee R4, FR-022)', () => {
  it('leaves values inside the range alone', () => {
    for (const hz of [A4_MIN_HZ, 432, A4_DEFAULT_HZ, 442, A4_MAX_HZ]) {
      expect(clampA4Hz(hz)).toBe(hz);
    }
  });

  it('clamps rather than rejecting, so a slider cannot produce an invalid state', () => {
    expect(clampA4Hz(A4_MIN_HZ - 1)).toBe(A4_MIN_HZ);
    expect(clampA4Hz(0)).toBe(A4_MIN_HZ);
    expect(clampA4Hz(-100)).toBe(A4_MIN_HZ);
    expect(clampA4Hz(A4_MAX_HZ + 1)).toBe(A4_MAX_HZ);
    expect(clampA4Hz(10_000)).toBe(A4_MAX_HZ);
  });

  it('falls back to the default for values that are not numbers at all', () => {
    // Distinct from clamping on purpose: NaN has no nearest valid value, so
    // there is nothing to clamp towards and 440 is the only honest answer.
    expect(clampA4Hz(Number.NaN)).toBe(A4_DEFAULT_HZ);
    expect(clampA4Hz(Number.POSITIVE_INFINITY)).toBe(A4_DEFAULT_HZ);
    expect(clampA4Hz(Number.NEGATIVE_INFINITY)).toBe(A4_DEFAULT_HZ);
  });

  it('covers the range the spec requires', () => {
    expect(A4_MIN_HZ).toBeLessThanOrEqual(415);
    expect(A4_MAX_HZ).toBeGreaterThanOrEqual(466);
    expect(A4_DEFAULT_HZ).toBe(440);
  });
});

describe('normalizePreferences (obligation P1, data-model §6)', () => {
  it('returns the defaults for absent data', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns the defaults for data of entirely the wrong shape', () => {
    for (const junk of ['nonsense', 42, true, [], () => undefined]) {
      expect(normalizePreferences(junk)).toEqual(DEFAULT_PREFERENCES);
    }
  });

  it('keeps valid values untouched', () => {
    const stored = { a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 };
    expect(normalizePreferences(stored)).toEqual({
      a4Hz: 432,
      accidentalStyle: 'flat',
      schemaVersion: PREFERENCES_SCHEMA_VERSION,
    });
  });

  it('clamps an out-of-range stored reference pitch', () => {
    expect(normalizePreferences({ a4Hz: 500, accidentalStyle: 'sharp' }).a4Hz).toBe(A4_MAX_HZ);
    expect(normalizePreferences({ a4Hz: 100, accidentalStyle: 'sharp' }).a4Hz).toBe(A4_MIN_HZ);
  });

  it('defaults a reference pitch that is not a number', () => {
    expect(normalizePreferences({ a4Hz: 'four forty' }).a4Hz).toBe(A4_DEFAULT_HZ);
    expect(normalizePreferences({ a4Hz: null }).a4Hz).toBe(A4_DEFAULT_HZ);
    expect(normalizePreferences({ a4Hz: {} }).a4Hz).toBe(A4_DEFAULT_HZ);
  });

  it('defaults an unrecognised accidental style', () => {
    expect(normalizePreferences({ accidentalStyle: 'quarter-tone' }).accidentalStyle).toBe('sharp');
    expect(normalizePreferences({ accidentalStyle: 7 }).accidentalStyle).toBe('sharp');
  });

  it('always writes the current schema version', () => {
    // Principle VI wants a forward-migration path from day one. Reading an
    // older record and writing it back at the current version is that path.
    expect(normalizePreferences({ schemaVersion: 0 }).schemaVersion).toBe(
      PREFERENCES_SCHEMA_VERSION
    );
    expect(normalizePreferences({ schemaVersion: 99 }).schemaVersion).toBe(
      PREFERENCES_SCHEMA_VERSION
    );
    expect(normalizePreferences({}).schemaVersion).toBe(PREFERENCES_SCHEMA_VERSION);
  });

  it('repairs one bad field without discarding the good ones', () => {
    // Throwing away a perfectly good accidental preference because the pitch
    // was corrupt would be a worse answer than the one the user set.
    const repaired = normalizePreferences({ a4Hz: 'broken', accidentalStyle: 'flat' });
    expect(repaired.accidentalStyle).toBe('flat');
    expect(repaired.a4Hz).toBe(A4_DEFAULT_HZ);
  });

  it('never throws, whatever it is handed', () => {
    const hostile: unknown[] = [
      null,
      undefined,
      Number.NaN,
      { a4Hz: Number.NaN },
      { a4Hz: Number.POSITIVE_INFINITY, accidentalStyle: null },
      Object.create(null),
      {
        get a4Hz(): number {
          throw new Error('hostile getter');
        },
      },
    ];

    for (const value of hostile) {
      expect(() => normalizePreferences(value)).not.toThrow();
    }
  });
});

describe('isNonStandardReference (FR-022)', () => {
  it('is false at concert pitch and true anywhere else', () => {
    expect(isNonStandardReference(A4_DEFAULT_HZ)).toBe(false);
    expect(isNonStandardReference(432)).toBe(true);
    expect(isNonStandardReference(A4_MAX_HZ)).toBe(true);
    // Derived in one place so no screen can forget to show the indicator.
    expect(isNonStandardReference(440.5)).toBe(true);
  });
});

describe('loadPreferences (obligation P1)', () => {
  it('returns the defaults when nothing is stored', async () => {
    const store = new InMemoryPreferencesStore();
    expect(await loadPreferences(store)).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns the defaults when the store reports corrupt data', async () => {
    const store = new InMemoryPreferencesStore({
      a4Hz: 432,
      accidentalStyle: 'flat',
      schemaVersion: 1,
    });
    store.corrupt = true;
    expect(await loadPreferences(store)).toEqual(DEFAULT_PREFERENCES);
  });

  it('returns the defaults when the store rejects outright', async () => {
    // The port says load() never rejects. An adapter that breaks that promise
    // must still not take the tuner down with it.
    const broken = {
      load: () => Promise.reject(new Error('storage is on fire')),
      save: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    await expect(loadPreferences(broken)).resolves.toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips a saved preference', async () => {
    const store = new InMemoryPreferencesStore();
    await savePreferences(store, { a4Hz: 415, accidentalStyle: 'flat', schemaVersion: 1 });
    expect(await loadPreferences(store)).toEqual({
      a4Hz: 415,
      accidentalStyle: 'flat',
      schemaVersion: PREFERENCES_SCHEMA_VERSION,
    });
  });
});

describe('savePreferences (obligation P2)', () => {
  it('reports success rather than swallowing the outcome', async () => {
    const store = new InMemoryPreferencesStore();
    await expect(savePreferences(store, DEFAULT_PREFERENCES)).resolves.toBe(true);
  });

  it('reports failure instead of throwing, so tuning is never blocked', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('quota exceeded');

    // Principle I forbids a silent catch: the caller is told, and can surface
    // it. What it must NOT do is reject and take the settings screen down.
    await expect(savePreferences(store, DEFAULT_PREFERENCES)).resolves.toBe(false);
  });

  it('normalises before writing, so nothing invalid ever reaches storage', async () => {
    const store = new InMemoryPreferencesStore();
    await savePreferences(store, {
      a4Hz: 9999,
      accidentalStyle: 'flat',
      schemaVersion: 0,
    });

    expect(await store.load()).toEqual({
      a4Hz: A4_MAX_HZ,
      accidentalStyle: 'flat',
      schemaVersion: PREFERENCES_SCHEMA_VERSION,
    });
  });
});
