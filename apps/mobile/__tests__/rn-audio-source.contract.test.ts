import { audioSourceContract } from '@chromatic-tuner/core/testing';
import { AudioManager } from 'react-native-audio-api';

import { RNAudioSource } from '../src/adapters/rn-audio-source';

const sessionOptions = AudioManager.setAudioSessionOptions as jest.Mock;
const sessionActivity = AudioManager.setAudioSessionActivity as jest.Mock;

const CONFIG = { sampleRate: 44100, bufferLength: 1024 } as const;

/**
 * T045: the shared port contract suite, pointed at the real mobile adapter.
 *
 * This is why the suite in `packages/core/testing/port-contract-tests.ts`
 * imports no test runner — `packages/*` run under Vitest and this runs under
 * Jest, and one suite has to satisfy both.
 *
 * `react-native-audio-api` is mocked at the module boundary in jest.setup.js;
 * everything above it is the production adapter.
 */
describe('AudioSource contract — RNAudioSource', () => {
  for (const [name, check] of Object.entries(audioSourceContract)) {
    it(name, async () => {
      await check(() => new RNAudioSource());
    });
  }
});

/**
 * Regression: the tuner ran on a physical iPhone, showed "listening", and heard
 * nothing at all.
 *
 * `react-native-audio-api` defaults the iOS session to the `Playback` category,
 * which cannot record. Starting a recorder under it resolves normally and
 * delivers frames of pure silence, so there is no error anywhere to catch — the
 * only symptom is a tuner that never reports a note. Nothing in the JS API
 * hints at this, and no test that mocks the recorder alone can see it.
 *
 * These assertions fail against the adapter as it was written.
 */
describe('RNAudioSource iOS audio session', () => {
  beforeEach(() => {
    sessionOptions.mockClear();
    sessionActivity.mockClear();
  });

  it('selects a category that can actually record, before capture starts', async () => {
    const source = new RNAudioSource();
    await source.start(CONFIG, () => {});

    expect(sessionOptions).toHaveBeenCalledWith(expect.objectContaining({ iosCategory: 'record' }));
    expect(sessionActivity).toHaveBeenCalledWith(true);

    await source.stop();
  });

  it('asks iOS to leave the input signal alone', async () => {
    const source = new RNAudioSource();
    await source.start(CONFIG, () => {});

    // `measurement` disables AGC, noise suppression and EQ. Each one reshapes
    // the waveform the ±1 cent budget is measured on, and AGC in particular
    // pumps the amplitude of a decaying plucked string.
    expect(sessionOptions).toHaveBeenCalledWith(
      expect.objectContaining({ iosMode: 'measurement' })
    );

    await source.stop();
  });

  it('releases the session on stop, not merely the recorder (A4, FR-033)', async () => {
    const source = new RNAudioSource();
    await source.start(CONFIG, () => {});
    await source.stop();

    // Last, not merely called: start() activates it, so asserting on any call
    // would pass even if stop() never deactivated anything.
    expect(sessionActivity).toHaveBeenLastCalledWith(false);
  });
});

describe('RNAudioSource sample-rate reporting (obligation A5)', () => {
  it('reports the rate the platform actually gave, not the one requested', async () => {
    const source = new RNAudioSource();
    const info = await source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {});

    expect(info.sampleRate).toBe(48000);
    expect(info.sampleRate).not.toBe(44100);

    await source.stop();
  });
});
