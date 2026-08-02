import AsyncStorage from '@react-native-async-storage/async-storage';
import { preferencesStoreContract } from '@chromatic-tuner/core/testing';

import { AsyncStoragePreferences } from '../src/adapters/async-storage-preferences';

/**
 * T085: the shared port contract suite, pointed at the real mobile preferences
 * adapter.
 *
 * The same suite runs against the in-memory double in `packages/core`, so an
 * adapter cannot quietly diverge from the behaviour the core relies on.
 */
describe('PreferencesStore contract — AsyncStoragePreferences', () => {
  for (const [name, check] of Object.entries(preferencesStoreContract)) {
    it(name, async () => {
      await check(() => new AsyncStoragePreferences());
    });
  }
});

describe('AsyncStoragePreferences failure handling', () => {
  it('resolves null rather than rejecting when the stored value is not JSON', async () => {
    // Obligation P1's real-world case: a half-written record, or something
    // another version of the app left behind. Validation lives in the core, so
    // all this adapter owes is "null, never throw".
    await AsyncStorage.setItem('chromatic-tuner:preferences', '{ this is not json');

    const store = new AsyncStoragePreferences();
    await expect(store.load()).resolves.toBeNull();

    await store.clear();
  });

  it('round-trips through the same key the app actually reads', async () => {
    // Guards against the adapter and a future migration disagreeing about the
    // storage key, which would silently look like "the user has no settings".
    const store = new AsyncStoragePreferences();
    await store.save({ a4Hz: 415, accidentalStyle: 'flat', schemaVersion: 1 });

    const raw = await AsyncStorage.getItem('chromatic-tuner:preferences');

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ a4Hz: 415, accidentalStyle: 'flat', schemaVersion: 1 });

    await store.clear();
  });
});
