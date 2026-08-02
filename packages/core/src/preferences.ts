import { A4_DEFAULT_HZ, A4_MAX_HZ, A4_MIN_HZ } from './notes/frequency';
import type { PreferencesStore, StoredPreferences } from './ports/preferences-store';
import type { AccidentalStyle } from './types';

export { A4_DEFAULT_HZ, A4_MAX_HZ, A4_MIN_HZ };

/**
 * Bumped only when the stored shape changes incompatibly.
 *
 * Principle VI requires a forward-migration path from the first release, and
 * retrofitting one onto records already on users' devices is far more expensive
 * than carrying the field from day one (data-model §6).
 */
export const PREFERENCES_SCHEMA_VERSION = 1;

export const DEFAULT_PREFERENCES: StoredPreferences = {
  a4Hz: A4_DEFAULT_HZ,
  accidentalStyle: 'sharp',
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
  try {
    ({ a4Hz, accidentalStyle } = raw as { a4Hz?: unknown; accidentalStyle?: unknown });
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
