import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

/**
 * 008 / L13 (FR-171, FR-175, FR-180): the app declares an icon at all.
 *
 * The defect this guards is not a wrong icon, it is **no icon**. Expo's
 * `withIosIcons` has an `else` branch that writes a blank white 1024×1024 when
 * none is configured — its own comment says it exists "to mitigate the chance of
 * a submission failure to the app store" — so an iconless build succeeds
 * silently and ships a placeholder that looks deliberate. Four features passed
 * over it.
 *
 * **This is the second layer, and on its own it is not the gate.** It reads
 * `app.config.ts` as written; a plugin can rewrite the config on its way to
 * `Info.plist` and this test would agree with the source regardless. The
 * assertion that matters is `verify-listing.mjs`'s `identity` group, against the
 * *resolved* config — the same split L12 already uses. What this layer adds is
 * speed and locality: it fails in the mobile suite, next to the file at fault,
 * without a build or a `pnpm exec expo config` round trip.
 *
 * Existence on disk is checked because a path that resolves to nothing is the
 * failure mode a typo produces, and Expo does not report it — the same `else`
 * branch swallows a missing file into the same white square.
 */
describe('app.config.ts ships this product icon (008, L13)', () => {
  // Expo resolves an icon path against the project directory, so the test has
  // to as well. `__dirname` is `apps/mobile/__tests__`.
  const fromProject = (path: string) => resolve(__dirname, '..', path);

  it('declares a top-level icon that exists', () => {
    expect(config.icon).toBeDefined();
    expect(existsSync(fromProject(config.icon as string))).toBe(true);
  });

  it('declares both adaptive layers, and they exist', () => {
    // Both, not one. A top-level `icon` alone makes Android skip the layering
    // system entirely and present a shrunken, unmasked tile — `withAndroidIcons`
    // says so in its own comment — which is not FR-174.
    const adaptive = config.android?.adaptiveIcon;

    expect(adaptive?.foregroundImage).toBeDefined();
    expect(adaptive?.backgroundImage).toBeDefined();
    expect(existsSync(fromProject(adaptive?.foregroundImage as string))).toBe(true);
    expect(existsSync(fromProject(adaptive?.backgroundImage as string))).toBe(true);
  });

  it('carries no backgroundColor, because a hex literal here is a lint error', () => {
    // research D3: `backgroundColor` takes a hex string, and a literal hex
    // anywhere in `apps/**` is an ESLint error in this repo. The background
    // layer is a generated solid PNG so the palette value never gets
    // transcribed into this file.
    expect(config.android?.adaptiveIcon?.backgroundColor).toBeUndefined();
  });

  it('points at its own assets rather than reaching into listing/', () => {
    // research D2: `@expo/image-utils` hands any non-http path straight to the
    // image library, so it resolves against the CWD and not the project root. A
    // `../../listing/…` path holds only while every caller happens to cd into
    // apps/mobile first, and it would make this app unbuildable without
    // `listing/`.
    for (const path of [
      config.icon,
      config.android?.adaptiveIcon?.foregroundImage,
      config.android?.adaptiveIcon?.backgroundImage,
    ]) {
      expect(path).toMatch(/^\.\/assets\//);
    }
  });
});
