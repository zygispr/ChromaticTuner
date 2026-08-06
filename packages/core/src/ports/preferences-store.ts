import type { AccidentalStyle, AppearancePreference } from '../types';

/**
 * The only state this product persists: three preferences, on the device the
 * user set them on. No accounts, no server, no sync (FR-032, SC-015, FR-131).
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §2,
 * extended by specs/005-dark-mode-toggle/contracts/appearance.md §2.
 */
export interface StoredPreferences {
  readonly a4Hz: number;
  readonly accidentalStyle: AccidentalStyle;
  /**
   * Added by 005. The PORT is unchanged — this is one more field inside a blob
   * both adapters already treat as opaque, which is why neither of them needed
   * to learn anything (contract §5).
   */
  readonly appearance: AppearancePreference;
  /**
   * Forward-migration hook, carried from the first release because Principle VI
   * requires a migration path from day one and retrofitting one is far more
   * expensive than carrying it.
   */
  readonly schemaVersion: number;
}

export interface PreferencesStore {
  /**
   * Resolves `null` — never rejects — for absent, corrupt, or unparseable
   * data. Validation and defaulting happen once in the core, not in each
   * adapter (obligation P1). A broken preference must never block tuning.
   */
  load(): Promise<StoredPreferences | null>;

  /**
   * Persist. A failure here MUST NOT crash or block tuning; it is surfaced
   * quietly and the app keeps working (obligation P2).
   */
  save(prefs: StoredPreferences): Promise<void>;

  /** Remove all stored preferences, returning the app to its defaults. */
  clear(): Promise<void>;
}
