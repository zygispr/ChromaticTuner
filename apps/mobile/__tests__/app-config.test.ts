import listing from '../../../listing/store-listing.json';
import appConfig from '../app.config';
import pkg from '../package.json';

/**
 * T011 / L12.1, L12.2: the app's identity is derived, not transcribed
 * (FR-105, FR-106, FR-107).
 *
 * Before 004 the microphone purpose sentence was written twice inside
 * `app.json` alone — once in `ios.infoPlist` and once in the
 * `react-native-audio-api` plugin's config — and two listings would have made
 * four hand-maintained copies of one sentence. The two shells also disagreed
 * about their own bundle identifier, and `app.json` and `package.json`
 * disagreed about the version.
 *
 * This asserts the shape that replaced them: one claim in
 * `listing/store-listing.json`, read by `app.config.ts` in Node at prebuild
 * time. It is deliberately an equality test against the source of truth rather
 * than against a literal — a literal here would be a fifth copy of the sentence
 * and would pass while the config drifted.
 *
 * `verify-listing.mjs` asserts the same two guarantees against the *resolved*
 * config (T040), because that is what actually reaches Info.plist and
 * AndroidManifest.xml. This test covers the source; that check covers the
 * output. Neither substitutes for the other.
 */
// A full ConfigContext, because that is the shape Expo passes. The three path
// fields go unread: this config derives everything from the listing and from
// package.json rather than from where it was invoked, which is the property
// that makes it testable at all.
const config = appConfig({
  projectRoot: '.',
  staticConfigPath: null,
  packageJsonPath: null,
  config: {},
});

describe('app.config.ts derives identity from listing/store-listing.json', () => {
  it('states the microphone purpose once, and uses it everywhere iOS asks for it', () => {
    const audioApiPlugin = config.plugins?.find(
      (plugin): plugin is [string, { iosMicrophonePermission?: string }] =>
        Array.isArray(plugin) && plugin[0] === 'react-native-audio-api'
    );

    expect(config.ios?.infoPlist?.NSMicrophoneUsageDescription).toBe(
      listing.claims.purposeSentence
    );
    expect(audioApiPlugin?.[1]?.iosMicrophonePermission).toBe(listing.claims.purposeSentence);
  });

  it('uses one application identifier on both platforms (D3 — permanent from first publication)', () => {
    expect(config.ios?.bundleIdentifier).toBe(listing.claims.identifier);
    expect(config.android?.package).toBe(listing.claims.identifier);
  });

  it('takes its marketing version from package.json, not from a second copy', () => {
    expect(config.version).toBe(pkg.version);
  });

  it('feeds one build integer to both stores, so they cannot drift', () => {
    // FR-107: a resubmission of an unchanged version must not produce a build
    // number one store accepts and the other rejects. iOS wants a string,
    // Android an integer; they must be the same number.
    expect(config.ios?.buildNumber).toBe(String(config.android?.versionCode));
    expect(Number.isInteger(config.android?.versionCode)).toBe(true);
  });

  it('names the app the way every other surface names it', () => {
    expect(config.name).toBe(listing.claims.appName);
  });
});
