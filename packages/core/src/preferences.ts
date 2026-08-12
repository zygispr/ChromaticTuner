import { A4_DEFAULT_HZ, A4_MAX_HZ, A4_MIN_HZ } from './notes/frequency';
import type { PreferencesStore, StoredPreferences } from './ports/preferences-store';
import type { AccidentalStyle, AppearancePreference, TunerDisplay } from './types';

export { A4_DEFAULT_HZ, A4_MAX_HZ, A4_MIN_HZ };

// Defined in a module of its own so `apps/web/vite.config.ts` can import it by
// relative path; see that file's own comment and preferences-key.ts for why a
// zero-import module is the only shape that works there (M8).
export { PREFERENCES_STORAGE_KEY } from './preferences-key';

/**
 * Bumped only when the stored shape changes incompatibly.
 *
 * Principle VI requires a forward-migration path from the first release, and
 * retrofitting one onto records already on users' devices is far more expensive
 * than carrying the field from day one (data-model §6).
 *
 * Still 1 after 007 added `tunerDisplay`, deliberately. An ABSENT field is not
 * an incompatible shape: the repair clause below turns "no display stored" into
 * `'line'`, which is the whole of FR-149, with no migration code. Moving the
 * number for an additive change would teach the next reader that it moves for
 * additive changes — the opposite of what it is for (research D9, and D6 of
 * 005, which reached the same conclusion for `appearance`).
 */
export const PREFERENCES_SCHEMA_VERSION = 1;

export const DEFAULT_PREFERENCES: StoredPreferences = {
  a4Hz: A4_DEFAULT_HZ,
  accidentalStyle: 'sharp',
  // FR-114 and FR-122 in one line: someone who has never chosen, and a record
  // written before this feature existed, both land on the behaviour the app
  // already had.
  appearance: 'system',
  // FR-149, the same idea once more: the display nobody chose is the one the
  // app has always drawn, so upgrading changes nothing for anyone who never
  // opens Settings.
  tunerDisplay: 'line',
  schemaVersion: PREFERENCES_SCHEMA_VERSION,
};

/**
 * Bring a reference pitch into the supported range.
 *
 * Clamping rather than rejecting is guarantee R4: a slider dragged to its end
 * stop should sit at the end stop, not throw away the gesture and snap back to
 * 440. An out-of-range number still expresses which direction the user wanted.
 *
 * A value that is not a finite number is a different case entirely — there is
 * no nearest valid value to clamp towards — so it falls back to concert pitch.
 */
export function clampA4Hz(hz: number): number {
  if (!Number.isFinite(hz)) return A4_DEFAULT_HZ;
  return Math.min(A4_MAX_HZ, Math.max(A4_MIN_HZ, hz));
}

/** Is this reference pitch something the tuner must warn about (FR-022)? */
export function isNonStandardReference(a4Hz: number): boolean {
  return a4Hz !== A4_DEFAULT_HZ;
}

function isAccidentalStyle(value: unknown): value is AccidentalStyle {
  return value === 'sharp' || value === 'flat';
}

/**
 * Guarantee M5. Deliberately an exact match against the three literals: the
 * union is case-sensitive, so `'System'` and `'auto'` — the two values a
 * hand-edit or a rival implementation would plausibly produce — are rejected
 * rather than coerced.
 */
function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Guarantee G16. Exact match against the two literals, case-sensitive, for the
 * same reason `isAppearancePreference` is: `'Line'`, `'circle'` and `'circular'`
 * are all values a hand-edit or a rival implementation would plausibly write,
 * and none of them is a value this app has ever produced. A loose match would
 * let `'circle'` through, and nothing downstream can render it.
 */
function isTunerDisplay(value: unknown): value is TunerDisplay {
  return value === 'line' || value === 'dial';
}

/**
 * Turn anything at all into a usable set of preferences.
 *
 * This function is TOTAL: it is the single place where obligation P1's promise
 * is kept, so every adapter can hand over whatever it found — absent, a
 * half-written JSON blob, a record from a future version, a hand-edited
 * localStorage entry — without any of them repeating the validation and one of
 * them inevitably getting it wrong.
 *
 * Fields are repaired independently. A corrupt reference pitch is no reason to
 * discard a perfectly good accidental preference the user actually chose.
 */
export function normalizePreferences(raw: unknown): StoredPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_PREFERENCES };
  }

  let a4Hz: unknown;
  let accidentalStyle: unknown;
  let appearance: unknown;
  let tunerDisplay: unknown;
  try {
    ({ a4Hz, accidentalStyle, appearance, tunerDisplay } = raw as {
      a4Hz?: unknown;
      accidentalStyle?: unknown;
      appearance?: unknown;
      tunerDisplay?: unknown;
    });
  } catch {
    // A throwing getter is not a shape we can read at all. Storage should never
    // produce one, but "never throws" has to mean never.
    return { ...DEFAULT_PREFERENCES };
  }

  return {
    a4Hz: typeof a4Hz === 'number' ? clampA4Hz(a4Hz) : A4_DEFAULT_HZ,
    accidentalStyle: isAccidentalStyle(accidentalStyle)
      ? accidentalStyle
      : DEFAULT_PREFERENCES.accidentalStyle,
    // M5-M7. An absent appearance is the normal case for every record written
    // before 005, and it takes the default like any other unusable value — one
    // clause, no migration, which is why D6 leaves the schema version alone.
    appearance: isAppearancePreference(appearance) ? appearance : DEFAULT_PREFERENCES.appearance,
    // G16-G18. Repaired independently of its three neighbours, like all of
    // them: a display choice nobody can render is no reason to discard a
    // reference pitch the user set deliberately. An absent field lands here
    // too, which is how a pre-007 record becomes a line with no migration.
    tunerDisplay: isTunerDisplay(tunerDisplay) ? tunerDisplay : DEFAULT_PREFERENCES.tunerDisplay,
    // Always written at the current version: reading an older record and
    // storing it back is the migration.
    schemaVersion: PREFERENCES_SCHEMA_VERSION,
  };
}

/**
 * Read preferences, falling back to the defaults for anything unusable.
 *
 * The port promises `load` never rejects, but this catches anyway: an adapter
 * that breaks that promise must degrade to concert pitch, not take the tuner
 * down on startup.
 */
export async function loadPreferences(store: PreferencesStore): Promise<StoredPreferences> {
  try {
    return normalizePreferences(await store.load());
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Write preferences, reporting whether they were actually persisted.
 *
 * Obligation P2: a storage failure — a full quota, private browsing, a revoked
 * permission — must not block tuning. It must also not vanish, which is what
 * Principle I means by forbidding a silent catch. Returning the outcome lets
 * the caller say "this will not be remembered" while everything keeps working.
 */
export async function savePreferences(
  store: PreferencesStore,
  preferences: StoredPreferences
): Promise<boolean> {
  try {
    await store.save(normalizePreferences(preferences));
    return true;
  } catch {
    return false;
  }
}
