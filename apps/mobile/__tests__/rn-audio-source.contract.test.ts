import { audioSourceContract } from '@chromatic-tuner/core/testing';
import { AudioManager } from 'react-native-audio-api';

import { RNAudioSource } from '../src/adapters/rn-audio-source';

const sessionOptions = AudioManager.setAudioSessionOptions as jest.Mock;
const sessionActivity = AudioManager.setAudioSessionActivity as jest.Mock;
const checkPermissions = AudioManager.checkRecordingPermissions as jest.Mock;

/**
 * The mock's controls for the library's `Result` contract; see jest.setup.js.
 * Typed here because the real module declares neither — they exist only in the
 * mock, and casting at one place keeps the tests below type-checked.
 */
const audioApi = jest.requireMock('react-native-audio-api') as {
  __setRecorderStartResult: (result: { status: 'error'; message: string } | null) => void;
  __lastRecorder: () => { callbackOptions: { sampleRate: number } | null } | null;
};

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
  it('reports the rate the frames actually arrive at', async () => {
    const source = new RNAudioSource();
    const info = await source.start({ sampleRate: 44100, bufferLength: 1024 }, () => {});

    // Unlike a browser, this library does not substitute a rate: it resamples
    // the hardware input to the rate the callback was configured with —
    // AVAudioConverter on iOS, Oboe's converter on Android — and constructs the
    // delivered buffer at that rate. So the rate to report is the configured
    // one, and the two MUST be the same number. `start()` itself reports no
    // rate at all; it resolves with `{ status }` and nothing else.
    expect(audioApi.__lastRecorder()?.callbackOptions?.sampleRate).toBe(44100);
    expect(info.sampleRate).toBe(44100);

    await source.stop();
  });
});

/**
 * Regression: with the microphone turned off for the app in Settings, the tuner
 * showed "Listening — play a string" and heard nothing at all.
 *
 * `AudioRecorder.start()` does not REJECT when the platform refuses it. It
 * resolves with the library's `Result` union — `{ status: 'error', message }` —
 * and iOS produces exactly that for a blocked microphone, before it touches the
 * engine. The adapter read every resolved value as success, so nothing was left
 * for `TunerSession` to fail on: it went to `listening`, took the wake lock, and
 * waited for frames that could never arrive (obligation A3, guarantee S1).
 *
 * These assertions fail against the adapter as it was written.
 */
describe('RNAudioSource start refusal (obligation A3)', () => {
  afterEach(() => {
    audioApi.__setRecorderStartResult(null);
    checkPermissions.mockResolvedValue('Granted');
  });

  it('rejects with a typed error when the recorder reports failure', async () => {
    audioApi.__setRecorderStartResult({
      status: 'error',
      message: 'Microphone permissions are not granted',
    });
    checkPermissions.mockResolvedValue('Denied');

    const source = new RNAudioSource();

    await expect(source.start(CONFIG, () => {})).rejects.toMatchObject({
      kind: 'permission-denied',
      canRetry: true,
    });
  });

  it('classifies a blocked microphone by the permission state, not by the message', async () => {
    // What Android reports for the same cause: nothing checks the permission
    // before opening the stream, so the refusal surfaces from Oboe with no word
    // a string match could recognise. The permission state is the same question
    // asked where it has an answer, and it decides the one banner that names
    // Settings (SC-014).
    audioApi.__setRecorderStartResult({
      status: 'error',
      message: 'Failed to open audio stream: ErrorInternal',
    });
    checkPermissions.mockResolvedValue('Denied');

    const source = new RNAudioSource();

    await expect(source.start(CONFIG, () => {})).rejects.toMatchObject({
      kind: 'permission-denied',
    });
  });

  it('does not blame the permission for a failure that happens while it is held', async () => {
    audioApi.__setRecorderStartResult({ status: 'error', message: 'The input is in use' });
    checkPermissions.mockResolvedValue('Granted');

    const source = new RNAudioSource();

    await expect(source.start(CONFIG, () => {})).rejects.toMatchObject({
      kind: 'microphone-busy',
    });
  });

  it('refuses a blocked microphone without touching the audio session', async () => {
    checkPermissions.mockResolvedValue('Denied');
    sessionOptions.mockClear();
    sessionActivity.mockClear();

    const source = new RNAudioSource();
    await expect(source.start(CONFIG, () => {})).rejects.toMatchObject({
      kind: 'permission-denied',
    });

    // `TunerSession` retries a blocked permission once a second for as long as
    // the banner is up (FR-029), and activating the `record` category
    // interrupts whatever else is playing. A tuner that cannot hear anything
    // must not stop the user's music every second to discover that again.
    expect(sessionActivity).not.toHaveBeenCalled();
    expect(sessionOptions).not.toHaveBeenCalled();
  });

  it('still opens the session when the prompt has yet to be answered', async () => {
    // 'Undetermined' is not a refusal. On iOS starting the recorder is what
    // raises the system prompt in the first place, so treating it as blocked
    // would mean the prompt could never appear — and on Android it is also what
    // `checkRecordingPermissions` reports after a Settings revoke, where the
    // start must be attempted for the failure to be classified at all.
    checkPermissions.mockResolvedValue('Undetermined');
    sessionActivity.mockClear();

    const source = new RNAudioSource();
    await source.start(CONFIG, () => {});

    expect(sessionActivity).toHaveBeenCalledWith(true);

    await source.stop();
  });

  it('releases the audio session it opened for a start that failed (A4, FR-033)', async () => {
    audioApi.__setRecorderStartResult({ status: 'error', message: 'Microphone permissions' });
    sessionActivity.mockClear();

    const source = new RNAudioSource();
    await expect(source.start(CONFIG, () => {})).rejects.toBeDefined();

    // The session was activated before the recorder was asked to start, so a
    // refused start that left it active would keep the OS recording indicator
    // lit for a tuner that is not recording anything.
    expect(sessionActivity).toHaveBeenLastCalledWith(false);
  });

  it('leaves the source startable again, so the session can recover (FR-029)', async () => {
    audioApi.__setRecorderStartResult({ status: 'error', message: 'Microphone permissions' });
    const source = new RNAudioSource();
    await expect(source.start(CONFIG, () => {})).rejects.toBeDefined();

    // A refused start must not count as running, or the retry that follows the
    // user allowing the microphone would reject on A7 instead of opening it.
    audioApi.__setRecorderStartResult(null);
    await expect(source.start(CONFIG, () => {})).resolves.toEqual({ sampleRate: 44100 });

    await source.stop();
  });
});
