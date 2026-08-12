import { describe, expect, it } from 'vitest';

import {
  A4_DEFAULT_HZ,
  A4_MAX_HZ,
  A4_MIN_HZ,
  DEFAULT_PREFERENCES,
  PREFERENCES_SCHEMA_VERSION,
  PREFERENCES_STORAGE_KEY,
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
    const stored = { a4Hz: 432, accidentalStyle: 'flat', appearance: 'dark', schemaVersion: 1 };
    expect(normalizePreferences(stored)).toEqual({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'line',
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

  /**
   * V40 / M5-M7 — the appearance field (data-model §2).
   *
   * Split out rather than folded into the cases above because the field's
   * default is what makes FR-122 true for records written before this feature
   * existed: they have no appearance, and "no appearance" must mean "match the
   * device", which is exactly what the app did before it could be told
   * otherwise.
   */
  it('defaults every unusable appearance to system (M5, FR-121)', () => {
    // 'System' and 'auto' are here deliberately. They are the two values a
    // plausible hand-edit or a rival implementation would produce, and both
    // must be rejected: the union is case-sensitive and 'auto' is not a member
    // of it, so accepting either would mean the guard is doing a loose match.
    const unusable = [undefined, null, 0, '', 'System', 'auto', 'Dark', 'chartreuse', true, {}, []];

    for (const value of unusable) {
      expect(
        normalizePreferences({ appearance: value }).appearance,
        `${JSON.stringify(value)} should have defaulted to 'system'`
      ).toBe('system');
    }
  });

  it('keeps each of the three permitted appearances (M5)', () => {
    for (const appearance of ['light', 'dark', 'system'] as const) {
      expect(normalizePreferences({ appearance }).appearance).toBe(appearance);
    }
  });

  it('repairs a bad appearance without disturbing the other fields (M6, FR-121)', () => {
    // The failure this catches is an implementation that resets the WHOLE
    // record when one field is unusable, throwing away a reference pitch the
    // user deliberately set because an unrelated field was corrupt.
    const repaired = normalizePreferences({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'chartreuse',
    });

    expect(repaired.appearance).toBe('system');
    expect(repaired.a4Hz).toBe(432);
    expect(repaired.accidentalStyle).toBe('flat');
  });

  it('repairs a bad reference pitch without disturbing a valid appearance (M6)', () => {
    // The same guarantee in the other direction — the one that would be missed
    // by only ever corrupting the new field.
    const repaired = normalizePreferences({ a4Hz: 'broken', appearance: 'dark' });

    expect(repaired.appearance).toBe('dark');
    expect(repaired.a4Hz).toBe(A4_DEFAULT_HZ);
  });

  it('loads a record written before this feature without loss (M7, FR-122)', () => {
    // Exactly the shape 001 shipped. No migration runs, and none should: D6
    // keeps the schema version at 1 because there is nothing to migrate.
    expect(normalizePreferences({ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 })).toEqual({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'system',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });
  });

  /**
   * G16-G18 — the tuner display field (007 data-model §2).
   *
   * The same shape of addition as `appearance` above, and it takes the same
   * answer for the same reason: an absent field is not an incompatible shape,
   * so the schema version does not move and no migration code exists. What
   * makes FR-149 true — "the horizontal display MUST be the default for anyone
   * who has not chosen" — is one repair clause, not a migration.
   */
  it('defaults every unusable tuner display to line (G16, FR-149, FR-151)', () => {
    // 'Line', 'circle' and 'circular' are the discriminating cases. A
    // pass-through with no validation at all satisfies any test that only
    // checks 'line' and 'dial' survive, and would happily store 'circle' —
    // which nothing downstream can render.
    const unusable = [
      undefined,
      null,
      0,
      42,
      '',
      'Line',
      'Dial',
      'circle',
      'circular',
      'horizontal',
      true,
      {},
      [],
    ];

    for (const value of unusable) {
      expect(
        normalizePreferences({ tunerDisplay: value }).tunerDisplay,
        `${JSON.stringify(value)} should have defaulted to 'line'`
      ).toBe('line');
    }
  });

  it('keeps each of the two permitted displays (G16)', () => {
    for (const tunerDisplay of ['line', 'dial'] as const) {
      expect(normalizePreferences({ tunerDisplay }).tunerDisplay).toBe(tunerDisplay);
    }
  });

  it('repairs a bad display without disturbing the other three fields (G17)', () => {
    const repaired = normalizePreferences({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'circle',
    });

    expect(repaired.tunerDisplay).toBe('line');
    expect(repaired.a4Hz).toBe(432);
    expect(repaired.accidentalStyle).toBe('flat');
    expect(repaired.appearance).toBe('dark');
  });

  it('repairs the other three without disturbing a valid display (G17)', () => {
    // The direction that would be missed by only ever corrupting the new
    // field. This guarantee weakens silently every time a field is added,
    // which is why it is re-asserted rather than assumed to still hold.
    const repaired = normalizePreferences({
      a4Hz: 'broken',
      accidentalStyle: 'quarter-tone',
      appearance: 'chartreuse',
      tunerDisplay: 'dial',
    });

    expect(repaired.tunerDisplay).toBe('dial');
    expect(repaired.a4Hz).toBe(A4_DEFAULT_HZ);
    expect(repaired.accidentalStyle).toBe('sharp');
    expect(repaired.appearance).toBe('system');
  });

  it('loads a pre-007 record without loss, and without a version bump (G18)', () => {
    // Exactly the shape 005 shipped: three preferences, no tunerDisplay.
    expect(
      normalizePreferences({
        a4Hz: 432,
        accidentalStyle: 'flat',
        appearance: 'dark',
        schemaVersion: 1,
      })
    ).toEqual({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });

    // The version must NOT have moved. A bump with no migration behind it
    // teaches the next reader that the number moves for additive changes,
    // which is the opposite of what it is for (research D9).
    expect(PREFERENCES_SCHEMA_VERSION).toBe(1);
  });

  it('defaults the display for a record with no fields at all (FR-149)', () => {
    expect(normalizePreferences({}).tunerDisplay).toBe('line');
    expect(DEFAULT_PREFERENCES.tunerDisplay).toBe('line');
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

describe('PREFERENCES_STORAGE_KEY (M8, research D4)', () => {
  it('is the exact key already on users devices', () => {
    // The literal is pinned HERE and nowhere else. Every consumer imports the
    // constant since 005, so the class of bug where two of them disagree is
    // gone — but that also means a change to this string would compile, pass,
    // and silently orphan the settings of everyone who already has some. This
    // assertion is the tripwire for that; changing it must be a deliberate act
    // with a migration behind it.
    expect(PREFERENCES_STORAGE_KEY).toBe('chromatic-tuner:preferences');
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
      appearance: 'dark',
      tunerDisplay: 'line',
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
    await savePreferences(store, {
      a4Hz: 415,
      accidentalStyle: 'flat',
      appearance: 'light',
      tunerDisplay: 'dial',
      schemaVersion: 1,
    });
    expect(await loadPreferences(store)).toEqual({
      a4Hz: 415,
      accidentalStyle: 'flat',
      appearance: 'light',
      tunerDisplay: 'dial',
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
      // Not a member of the union. It must be repaired on the way IN to
      // storage, not merely on the way out (M5) — otherwise a value the app
      // itself wrote is one that its own loader has to defend against.
      appearance: 'chartreuse' as never,
      tunerDisplay: 'circle' as never,
      schemaVersion: 0,
    });

    expect(await store.load()).toEqual({
      a4Hz: A4_MAX_HZ,
      accidentalStyle: 'flat',
      appearance: 'system',
      tunerDisplay: 'line',
      schemaVersion: PREFERENCES_SCHEMA_VERSION,
    });
  });
});
