import { audioSourceContract } from '@chromatic-tuner/core/testing';

import { CaptureAudioSource } from '../src/adapters/captureAudioSource';

const CONFIG = { sampleRate: 44100, bufferLength: 1024 } as const;

/**
 * T034: the shared port contract suite, pointed at the capture-build source.
 *
 * A port implementation that skips this suite is the thing the suite exists to
 * prevent. This one is only ever used by a screenshot build, which makes it
 * *more* worth checking rather than less: nothing else exercises it, and a
 * capture source that quietly violated A2 (buffer valid only for the callback)
 * or A7 (double start rejects) would produce screenshots of a tuner behaving
 * differently from the one that ships.
 */
describe('AudioSource contract — CaptureAudioSource', () => {
  for (const [name, check] of Object.entries(audioSourceContract)) {
    it(name, async () => {
      await check(() => new CaptureAudioSource());
    });
  }
});

describe('CaptureAudioSource generates a signal worth screenshotting', () => {
  it('delivers a non-silent buffer of the requested length', async () => {
    const source = new CaptureAudioSource();
    const batches: Float32Array[] = [];

    await source.start(CONFIG, (frames) => batches.push(Float32Array.from(frames)));
    await new Promise((resolve) => setTimeout(resolve, 120));
    await source.stop();

    expect(batches.length).toBeGreaterThan(0);
    expect(batches[0]!.length).toBe(CONFIG.bufferLength);

    // An empty state is exactly what FR-100 says a screenshot must not show, and
    // a source that resolved cleanly while emitting silence would produce one.
    const peak = Math.max(...Array.from(batches[0]!, Math.abs));
    expect(peak).toBeGreaterThan(0.1);
  });

  it('stops delivering frames once stopped', async () => {
    const source = new CaptureAudioSource();
    let count = 0;

    await source.start(CONFIG, () => (count += 1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    await source.stop();

    const afterStop = count;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(count).toBe(afterStop);
  });
});
