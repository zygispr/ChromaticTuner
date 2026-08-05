/**
 * Captures store screenshots from the real app on a simulator and an emulator
 * (research D7; FR-100, FR-101, SC-039; contract L9, L10).
 *
 *   pnpm listing:screenshots
 *   pnpm listing:screenshots --platform ios
 *
 * **This cannot run on CI.** It needs macOS with Xcode for the iOS half and an
 * Android SDK with a running emulator for the Android half; the project's CI
 * runners are Ubuntu. That is why the captured images are committed and CI
 * verifies the committed files instead (FR-111) — the same split `003` made for
 * `og-image.png`, and the honest one: a gate can check the pixels that shipped,
 * it cannot boot a phone.
 *
 * **What makes the screenshot honest.** The app is built with
 * `EXPO_PUBLIC_SCREENSHOT_CAPTURE=true`, which swaps the `AudioSource` port for
 * a generated tone (`src/adapters/captureAudioSource.ts`). Everything above that
 * port is the shipping app: real components, real filter chain, real render
 * path. Only the microphone is synthetic, and it is synthetic in the same way
 * the end-to-end suite's reference signals already are.
 *
 * **Why the Android profile is pinned.** Play requires a screenshot's longest
 * side to be no more than twice its shortest. A modern phone emulator boots at
 * 1080×2400 — 2.22:1 — and is rejected. The accepted ranges live in
 * `listing/limits.json` rather than in this script, and `verify-listing.mjs`
 * checks the committed pixels rather than the profile this script asked for.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const MOBILE = fileURLToPath(new URL('apps/mobile', ROOT));
const limits = JSON.parse(readFileSync(new URL('listing/limits.json', ROOT), 'utf8'));

const requested = process.argv.includes('--platform')
  ? [process.argv[process.argv.indexOf('--platform') + 1]]
  : ['ios', 'android'];

const APPEARANCES = limits.assets.appearances;

/** The screens worth showing a shopper, in the order a store displays them. */
const SHOTS = [{ name: '1-tuning', settle: 9000 }];

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
}

function available(command, args) {
  try {
    run(command, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * For commands whose failure is not a failure. `simctl terminate` and
 * `am force-stop` both exit non-zero when the app simply is not running, which
 * is the normal state before the first launch of each appearance.
 */
function tryRun(command, args) {
  try {
    run(command, args);
  } catch {
    /* the app was not running, which is what we wanted anyway */
  }
}

const identifier = JSON.parse(readFileSync(new URL('listing/store-listing.json', ROOT), 'utf8'))
  .claims.identifier;

/* ------------------------------------------------------------------------- *
 * iOS — xcrun simctl
 * ------------------------------------------------------------------------- */

/**
 * The device the App Store's required set comes from.
 *
 * Apple wants a 6.9" iPhone set and derives the smaller sizes from it. That is
 * **1320×2868**, which is the Pro Max — the plain Pro is 1206×2622 and is
 * rejected for this slot. The size is not a preference: `limits.json` lists the
 * accepted pairs and `verify-listing.mjs` measures the committed pixels, so
 * capturing on the wrong device fails the gate rather than the review.
 */
const IOS_DEVICE = 'iPhone 17 Pro Max';

function captureIos() {
  if (!available('xcrun', ['simctl', 'help'])) {
    return { skipped: 'xcrun simctl is unavailable — iOS capture needs macOS with Xcode' };
  }

  if (!run('xcrun', ['simctl', 'list', 'devices', 'booted']).includes(IOS_DEVICE)) {
    return {
      skipped:
        `no booted ${IOS_DEVICE}. The App Store's 6.9" slot is 1320×2868, which only the Pro Max ` +
        `produces. Boot it with \`xcrun simctl boot "${IOS_DEVICE}"\`, then install a capture ` +
        'build:\n    EXPO_PUBLIC_SCREENSHOT_CAPTURE=true npx expo run:ios --configuration Release ' +
        `--device "${IOS_DEVICE}"`,
    };
  }

  // Release, not the dev client. A debug build shows the expo-dev-client
  // launcher and its developer-menu sheet over the app, and a store screenshot
  // carrying developer chrome misrepresents the product as surely as a mockup
  // would. Release also inlines the JS bundle, so no Metro has to be running.

  // The simulator starts with no answer recorded for the microphone, so the app
  // shows its permission explainer rather than a reading. Granting it here is
  // what makes the capture reproducible — the alternative is a human tapping
  // Allow, which SC-039 rules out.
  run('xcrun', ['simctl', 'privacy', 'booted', 'grant', 'microphone', identifier]);

  // Pin the status bar, or SC-039 is unsatisfiable.
  //
  // The clock, the battery level and the signal bars are part of the captured
  // pixels, so without this every run differs from the last and
  // `git status --porcelain listing/assets/screenshots` can never be clean —
  // the reproduction check would report a change on every capture and mean
  // nothing. Apple's own marketing time is 9:41; using it also keeps the shot
  // from advertising the hour it was taken.
  run('xcrun', [
    'simctl',
    'status_bar',
    'booted',
    'override',
    '--time',
    '09:41',
    '--batteryState',
    'charged',
    '--batteryLevel',
    '100',
    '--wifiBars',
    '3',
    '--cellularBars',
    '4',
    '--cellularMode',
    'active',
  ]);

  const written = [];

  for (const appearance of APPEARANCES) {
    // The simulator's own appearance, not the app's — the app follows the system
    // (userInterfaceStyle: automatic), which is the behaviour being documented.
    run('xcrun', ['simctl', 'ui', 'booted', 'appearance', appearance]);
    tryRun('xcrun', ['simctl', 'terminate', 'booted', identifier]);
    run('xcrun', ['simctl', 'launch', 'booted', identifier]);

    for (const shot of SHOTS) {
      // The tuner needs a moment to open the source, fill its ring buffer, and
      // settle on a reading. Capturing early gets the empty state, which is
      // exactly what FR-100 says a screenshot must not show.
      sleep(shot.settle);

      const dir = fileURLToPath(
        new URL(`${limits.assets.screenshots.ios.root}/${appearance}`, ROOT)
      );
      mkdirSync(dir, { recursive: true });

      const path = `${dir}/${shot.name}.png`;
      run('xcrun', ['simctl', 'io', 'booted', 'screenshot', path]);
      written.push(path);
    }

    tryRun('xcrun', ['simctl', 'terminate', 'booted', identifier]);
  }

  return { written };
}

/* ------------------------------------------------------------------------- *
 * Android — adb
 * ------------------------------------------------------------------------- */

function captureAndroid() {
  if (!available('adb', ['version'])) {
    return {
      skipped:
        'adb is not on PATH — Android capture needs the Android SDK platform-tools and a ' +
        'running emulator. Pin the emulator to a 1080×1920 profile: Play rejects the common ' +
        '1080×2400 default at 2.22:1 (limits.assets.screenshots.android.maxAspectRatio).',
    };
  }

  if (
    !run('adb', ['devices'])
      .split('\n')
      .slice(1)
      .some((line) => line.trim().endsWith('device'))
  ) {
    return { skipped: 'no Android device or emulator attached to adb' };
  }

  const written = [];

  for (const appearance of APPEARANCES) {
    run('adb', ['shell', 'cmd', 'uimode', 'night', appearance === 'dark' ? 'yes' : 'no']);
    run('adb', [
      'shell',
      'monkey',
      '-p',
      identifier,
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    ]);

    for (const shot of SHOTS) {
      sleep(shot.settle);

      const dir = fileURLToPath(
        new URL(`${limits.assets.screenshots.android.root}/${appearance}`, ROOT)
      );
      mkdirSync(dir, { recursive: true });

      const path = `${dir}/${shot.name}.png`;
      writeFileSync(
        path,
        execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64e6 })
      );
      written.push(path);
    }

    tryRun('adb', ['shell', 'am', 'force-stop', identifier]);
  }

  return { written };
}

/** Blocking sleep — the app needs time to settle on a reading before capture. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* ------------------------------------------------------------------------- *
 * Drive
 * ------------------------------------------------------------------------- */

console.log(`Capturing from ${MOBILE} as ${identifier}`);
console.log('The app must already be installed as a capture build:');
console.log('  EXPO_PUBLIC_SCREENSHOT_CAPTURE=true pnpm --filter @chromatic-tuner/mobile ios\n');

let skipped = 0;

for (const platform of requested) {
  const result = platform === 'ios' ? captureIos() : captureAndroid();

  if (result.skipped) {
    skipped += 1;
    console.warn(`${platform}: skipped — ${result.skipped}`);
    continue;
  }

  console.log(`${platform}: wrote ${result.written.length} screenshots`);
  for (const path of result.written) console.log(`  ${path.replace(fileURLToPath(ROOT), '')}`);
}

// A skip is reported and is not a pass. `pnpm verify:listing` is what decides
// whether the committed set is complete, and it fails on a missing appearance
// rather than letting this script's silence stand in for a capture.
if (skipped > 0) {
  console.warn(
    `\n${skipped} platform(s) skipped. Run \`pnpm verify:listing\` — it fails on any missing ` +
      'screenshot set, so nothing here is taken on trust.'
  );
  process.exit(1);
}
