import { audioSourceContract } from '@chromatic-tuner/core/testing';

import { RNAudioSource } from '../src/adapters/rn-audio-source';

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

describe('RNAudioSource sample-rate reporting (obligation A5)', () => {
  it('reports the rate the platform actually gave, not the one requested', async () => {
    const source = new RNAudioSource();
    const info = await source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {});

    expect(info.sampleRate).toBe(48000);
    expect(info.sampleRate).not.toBe(44100);

    await source.stop();
  });
});
