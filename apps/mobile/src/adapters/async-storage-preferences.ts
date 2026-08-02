import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PreferencesStore, StoredPreferences } from '@chromatic-tuner/core';

/**
 * One key, one JSON blob (data-model §6). Namespaced so it cannot collide with
 * anything else the app stores later.
 */
const KEY = 'chromatic-tuner:preferences';

/**
 * Mobile adapter for the {@link PreferencesStore} port, backed by AsyncStorage.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §2
 *
 * Mirrors the web adapter exactly, and is just as thin on purpose: obligation
 * P1 puts validation in the core, once, so the two platforms cannot drift apart
 * about what a valid stored record is.
 *
 * AsyncStorage is device-local. It is NOT excluded from iCloud/Android backup,
 * which is a backup of the user's own device rather than transmission to us —
 * obligation P3 forbids syncing to a service, and nothing here does.
 */
export class AsyncStoragePreferences implements PreferencesStore {
  async load(): Promise<StoredPreferences | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw === null) return null;
      // Handed straight to the core's normaliser, which is total; the cast is
      // safe precisely because nothing here trusts the shape.
      return JSON.parse(raw) as StoredPreferences;
    } catch {
      // Unparseable JSON, or the native store being unavailable. Obligation P1:
      // resolve null, never reject — a broken preference must not block tuning.
      return null;
    }
  }

  async save(preferences: StoredPreferences): Promise<void> {
    // Not caught here: obligation P2 puts the decision about a failed write in
    // the core, which reports it so the UI can say the choice will not be
    // remembered. Swallowing it here would make that impossible.
    await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}
