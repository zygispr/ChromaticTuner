import type { PreferencesStore, StoredPreferences } from '@chromatic-tuner/core';

/**
 * One key, one JSON blob (data-model §6). Namespaced so it cannot collide with
 * anything else on the same origin.
 */
const KEY = 'chromatic-tuner:preferences';

/**
 * Web adapter for the {@link PreferencesStore} port, backed by `localStorage`.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §2
 *
 * Deliberately thin: it moves a string in and out of storage and does no
 * validation. Obligation P1 puts validation in the core, once, so two adapters
 * cannot disagree about what a valid record is — and so this one has nothing to
 * get wrong.
 *
 * `localStorage` is device-local and never synced or transmitted (P3).
 */
export class LocalStoragePreferences implements PreferencesStore {
  async load(): Promise<StoredPreferences | null> {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === null) return null;
      // Whatever this parses to is handed straight to the core's normaliser,
      // which is total. Note the cast is safe precisely because nothing here
      // trusts the shape.
      return JSON.parse(raw) as StoredPreferences;
    } catch {
      // Unparseable JSON, or storage unavailable entirely — Safari's private
      // mode has historically thrown on access rather than returning null.
      // Obligation P1: resolve null, never reject.
      return null;
    }
  }

  async save(preferences: StoredPreferences): Promise<void> {
    // Not caught here: obligation P2 puts the decision about a failed write in
    // the core, which reports it so the UI can say the choice will not be
    // remembered. Swallowing it here would make that impossible.
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  }

  async clear(): Promise<void> {
    window.localStorage.removeItem(KEY);
  }
}
