import type { PreferencesStore, StoredPreferences } from '../src/ports/preferences-store';

/**
 * In-memory {@link PreferencesStore} double.
 *
 * `corrupt` models the case obligation P1 cares about most: storage that holds
 * something unparseable. The store still resolves `null` rather than rejecting,
 * because a broken preference must never block tuning.
 */
export class InMemoryPreferencesStore implements PreferencesStore {
  private value: StoredPreferences | null = null;

  /** When true, load() behaves as if the stored data were unreadable. */
  public corrupt = false;
  /** When set, save() rejects — used to prove failures do not block tuning. */
  public saveError: Error | null = null;

  public loadCount = 0;
  public saveCount = 0;

  constructor(initial: StoredPreferences | null = null) {
    this.value = initial;
  }

  async load(): Promise<StoredPreferences | null> {
    this.loadCount += 1;
    if (this.corrupt) return null;
    return this.value;
  }

  async save(prefs: StoredPreferences): Promise<void> {
    this.saveCount += 1;
    if (this.saveError) throw this.saveError;
    this.value = prefs;
  }

  async clear(): Promise<void> {
    this.value = null;
    this.corrupt = false;
  }
}
