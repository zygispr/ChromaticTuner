/**
 * Asserts that a release bundle carries no screenshot-capture machinery
 * (contract L12.3; FR-113, SC-044; quickstart V35).
 *
 *   pnpm --filter @chromatic-tuner/mobile verify:release-bundle
 *
 * `apps/mobile/src/App.tsx` selects a capture `AudioSource` behind one
 * `EXPO_PUBLIC_*` flag so a store screenshot can show the real app displaying a
 * real reading (FR-100, D7). `EXPO_PUBLIC_*` values are **inlined at build
 * time**, so "the flag is only set on my machine" is a statement about a shell
 * and not about the artefact. This asserts the artefact.
 *
 * Three decisions here are load-bearing, and each was measured rather than
 * assumed while T047 was written.
 *
 * **1. It reads the module graph, not the shipped bytes.** A release bundle is
 * Hermes bytecode with every identifier minified: `grep -c captureAudioSource`
 * over the `.hbc` returns 0 — and so does `grep -c RNAudioSource`, for the
 * source that is definitely in it. A grep over that file is the purest form of
 * the assertion-satisfied-by-the-wrong-thing this feature exists to avoid: it
 * passes whatever the bundle contains. So the export is asked for source maps,
 * whose `sources` array names every module Metro actually pulled in, before any
 * renaming.
 *
 * **2. It clears Metro's cache on every export.** Metro's transform cache is
 * keyed on file contents and *not* on `EXPO_PUBLIC_*` values, so a second export
 * with the flag flipped reuses the first one's transform and reports whatever
 * the first build decided. A check that reads a stale transform proves nothing
 * about the build it claims to be checking.
 *
 * **3. It runs the positive control.** Absence is not evidence unless presence
 * is detectable, so the same detection is run against a build that *does* set
 * the flag, and must find the module there. Without that leg, a typo in the
 * module name — or an exporter that emitted nothing at all — reports a clean
 * release bundle forever. `apps/web/scripts/verify-build-output.mjs` sets the
 * precedent of a verifier driving its own builds for exactly this reason.
 *
 * Not wired into the CI `gates` job: it drives four Metro exports and belongs
 * with the release gates rather than the merge gates. `listing/submission.md`
 * lists it as a step before a build is submitted.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('..', import.meta.url));
const FLAG = 'EXPO_PUBLIC_SCREENSHOT_CAPTURE';
/**
 * The screenshot-capture adapter, named rather than pattern-matched on a word.
 *
 * Narrow on purpose. The obvious objection is that a rename would silently
 * disable the check — but that is what the positive control at the bottom is
 * for: move or rename this module and the control build stops finding it, which
 * is a loud failure saying the detection is looking for the wrong thing. A
 * broad pattern buys no protection against a rename and costs the ability to
 * tell this module from any other with "capture" in its name.
 */
const CAPTURE_MODULE = /adapters[/\\]captureAudioSource/;
const PLATFORMS = ['ios', 'android'];

const failures = [];

/**
 * The pattern discriminates, before four Metro exports are spent on it.
 *
 * `CAPTURE_MODULE` used to be `/capture/i`, which matched any module path
 * containing the word. That held until `9100379` added
 * `packages/react/src/capture-control.ts` — production code deciding whether the
 * MICROPHONE control belongs on screen (FR-036, FR-039), where "capture" means
 * audio capture and has nothing to do with screenshots. The gate went red
 * against a module that must ship, and stayed red unnoticed because it is a
 * release gate rather than a CI one.
 *
 * The worse half was silent. The same pattern feeds the positive control below,
 * so that leg began passing on `capture-control.ts` — meaning it would have
 * reported "presence is detectable" even with `captureAudioSource` detection
 * completely broken. A check whose control is satisfied by the wrong module
 * proves nothing in either direction, which is the exact failure this file's
 * header warns about.
 *
 * So the pattern is asserted against known paths rather than trusted to be
 * narrow. Cheap, and it fails in milliseconds instead of after four exports.
 */
const MUST_FLAG = ['/apps/mobile/src/adapters/captureAudioSource.ts'];
const MUST_NOT_FLAG = [
  // The defect this check exists for: legitimate, ships, name collides.
  '/packages/react/src/capture-control.ts',
];

for (const source of MUST_FLAG) {
  if (!CAPTURE_MODULE.test(source)) {
    failures.push(
      `the detection pattern does not match ${source}, the module contract L12.3 is about — ` +
        'every result below would be a clean bill of health for a bundle nobody inspected'
    );
  }
}

for (const source of MUST_NOT_FLAG) {
  if (CAPTURE_MODULE.test(source)) {
    failures.push(
      `the detection pattern matches ${source}, which is production code that must ship — ` +
        'it fails the release check against a legitimate module, and it satisfies the positive ' +
        'control below without the screenshot-capture source being present at all'
    );
  }
}

if (failures.length > 0) {
  console.error(`\nRelease bundle verification failed:\n  ${failures.join('\n  ')}\n`);
  process.exit(1);
}

/**
 * Export one platform's production bundle and return its module list.
 *
 * `--no-bytecode` is not a weakening of "release configuration": the bytecode
 * Hermes emits is a compilation of exactly this JavaScript, from exactly this
 * module graph, and it is the graph that answers the question. `--dev` is left
 * off, so this is a production export — minified, `__DEV__` false.
 */
function moduleGraph(platform, captureFlag) {
  const out = mkdtempSync(join(tmpdir(), `chromatic-release-${platform}-`));

  const env = { ...process.env };
  if (captureFlag) env[FLAG] = 'true';
  else delete env[FLAG];

  try {
    execFileSync(
      'npx',
      [
        'expo',
        'export',
        '--platform',
        platform,
        '--no-bytecode',
        '--source-maps',
        // See decision 2 in the header. Without this the second export of a run
        // reports the first export's answer.
        '--clear',
        '--output-dir',
        out,
      ],
      { cwd: APP, stdio: 'pipe', env }
    );

    const dir = join(out, '_expo', 'static', 'js', platform);
    const map = readdirSync(dir).find((name) => name.endsWith('.map'));

    if (!map) {
      failures.push(
        `the ${platform} export emitted no source map, so its module graph could not be read — ` +
          'this check cannot fall back to searching the bundle, because a minified bundle ' +
          'contains none of the names it would search for'
      );
      return null;
    }

    const { sources } = JSON.parse(readFileSync(join(dir, map), 'utf8'));
    const code = readFileSync(join(dir, map.replace(/\.map$/, '')), 'utf8');
    return { sources, code };
  } catch (error) {
    failures.push(`the ${platform} export failed: ${String(error.message).split('\n')[0]}`);
    return null;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// L12.3: the release configuration, which is what ships.
// ---------------------------------------------------------------------------
for (const platform of PLATFORMS) {
  const bundle = moduleGraph(platform, false);
  if (!bundle) continue;

  const capture = bundle.sources.filter((source) => CAPTURE_MODULE.test(source));
  if (capture.length > 0) {
    failures.push(
      `the ${platform} release bundle contains ${capture.join(', ')} — the capture audio source ` +
        "must not reach a store build. A static `import` puts a module in Metro's graph whether " +
        'or not the value it binds is ever used, so choosing at runtime is not enough: the ' +
        'require has to sit inside the inlined flag check in App.tsx'
    );
  }

  if (bundle.code.includes(FLAG)) {
    failures.push(
      `the ${platform} release bundle still names ${FLAG}. The value is inlined at build time, so ` +
        'the name surviving means the flag is being read at runtime from something the build did ' +
        'not fold away'
    );
  }
}

// ---------------------------------------------------------------------------
// The positive control: the same detection, against a build that does set the
// flag. If this finds nothing, the check above is not measuring anything.
// ---------------------------------------------------------------------------
for (const platform of PLATFORMS) {
  const bundle = moduleGraph(platform, true);
  if (!bundle) continue;

  const capture = bundle.sources.filter((source) => CAPTURE_MODULE.test(source));
  if (capture.length === 0) {
    failures.push(
      `the ${platform} CONTROL build set ${FLAG}=true and the capture source is still absent from ` +
        'its module graph. That does not mean the release bundle is clean — it means this check ' +
        'cannot tell a clean bundle from a dirty one, and the release result above is worthless. ' +
        'Either the capture path no longer works (screenshots would be captured from a live ' +
        'microphone) or the detection is looking for the wrong thing'
    );
  }
}

if (failures.length > 0) {
  console.error(`\nRelease bundle verification failed:\n  ${failures.join('\n  ')}\n`);
  process.exit(1);
}

console.log(
  `Release bundle OK: ${PLATFORMS.join(' and ')} carry no capture source and do not name ${FLAG}; ` +
    'the control builds that set it do carry one.'
);
