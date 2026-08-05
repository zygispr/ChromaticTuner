# Phase 0 Research: App Store Listing Optimisation

**Feature**: `004-app-store-listings` · **Date**: 2026-08-05

Ten decisions. Two of them (D1, D6) are forced by a constraint this repo already discovered and wrote
down — CI runs Node 20, which predates type stripping, so a `.mjs` script cannot import a `.ts`
module. Three of them (D2, D5, D10) exist because the same fact is currently written down in two or
three places that nothing keeps in step.

---

## D1 — The listing source of truth is JSON at `listing/`, not TypeScript and not a fastlane tree

**Decision**: Store copy for both stores lives in `listing/store-listing.json`, with field limits in
`listing/limits.json` and the forbidden vocabulary in `listing/out-of-scope-claims.json`.

**Rationale**: Three consumers have to read this file and they have nothing in common. `app.config.ts`
reads it in Node at prebuild time (D2). The verification gate reads it from an `.mjs` script (D8). A
person preparing a submission reads it by eye (FR-108). JSON is the only format all three already
speak.

TypeScript would have been the obvious choice — `apps/web/src/content.ts` is the precedent, and it is
a good one. It is unavailable here. `apps/web/scripts/generate-og-image.mjs` already records why in its
own header: *"importing a `.ts` module requires Node's type stripping, which the repo's Node 20 floor
predates"*. CI pins `node-version: 20` in all three jobs. The gate must run in CI, so the gate is
`.mjs`, so the data it reads cannot be `.ts`.

**Alternatives rejected**:

- **A TypeScript module plus a loader** (`tsx`, `ts-node`, or `esbuild-register`). A new dependency for
  a job the format choice avoids entirely — Principle II's dependency rule rejects a dependency
  standing in for ~30 lines of equivalent work, and this stands in for zero.
- **Raising the Node floor to ≥22 for native type stripping.** It would work, and it is tempting
  because it also unlocks `generate-og-image.mjs`. It is a toolchain change affecting every job, every
  contributor, and the `engines` field, made for one script's convenience. If it happens it should
  happen as its own change with its own justification, not smuggled in under a listing feature.
- **A fastlane `metadata/` tree** (`metadata/en-US/name.txt`, `subtitle.txt`, …). This is the shape
  `deliver` and `supply` consume, and adopting it would pay off the day submission is automated. That
  day is explicitly out of scope, so building for it now is speculative generality. It also makes the
  limit gate worse: one string per file means reading fourteen files to check fourteen limits, and a
  missing field is an absent file rather than a visibly empty value.

---

## D2 — `app.json` becomes `app.config.ts`, so identity is derived rather than transcribed

**Decision**: Replace `apps/mobile/app.json` with `apps/mobile/app.config.ts`, which imports
`listing/store-listing.json` and derives the app name, the identifiers, the version and build numbers,
and the microphone purpose strings from it.

**Rationale**: FR-105 requires the permission prompt, the listing copy, and the privacy policy to
explain the same purpose in the same terms. The purpose string is *already* written twice inside
`app.json` alone — once in `ios.infoPlist.NSMicrophoneUsageDescription` and once in the
`react-native-audio-api` plugin's `iosMicrophonePermission`. Adding two listings would make four
hand-maintained copies of one sentence.

`app.config.ts` executes in Node during `expo prebuild` and `expo start`, not inside the Metro bundle,
so it can read a JSON file outside the app directory with no bundler resolution involved. That matters
in this workspace specifically: `pnpm-workspace.yaml` sets `nodeLinker: hoisted` because Metro cannot
resolve pnpm's symlinks, and anything that has to pass through Metro inherits that fragility. This does
not.

**Alternatives rejected**:

- **Keep `app.json` and add a gate asserting the copies agree.** A gate that proves four hand-maintained
  copies of a sentence are identical is strictly worse than having one sentence: it catches the
  divergence after someone has already made it, and it is one more thing to keep in step.
- **Generate `app.json` from the JSON in a build step.** A generated file checked in beside its source,
  where Expo will happily read a stale copy. `app.config.ts` is the mechanism Expo provides for exactly
  this, and using it costs nothing.

---

## D3 — Both platforms use `com.chromatictuner.app`

**Decision**: The iOS bundle identifier moves from `com.prielaidas.chromatictuner` to
`com.chromatictuner.app`, matching the Android package. Recorded as permanent (FR-106).

**Rationale**: Confirmed with the user during planning. The spec had assumed the iOS value would win on
inertia grounds — that a generated `ios/` project already carried it. That argument was wrong:
`.gitignore:75` ignores `apps/mobile/ios/`, so the identifier has exactly **one** tracked occurrence,
`apps/mobile/app.json:11`. The iOS side is a one-line edit plus `expo prebuild -p ios --clean`; there is
no inertia to respect.

With cost symmetric, the reasons point the other way:

1. **The Android package is the visible half.** It appears in the Play Store URL —
   `play.google.com/store/apps/details?id=com.chromatictuner.app` — which is the link a guitarist pastes
   into a group chat. That is the same word-of-mouth channel `003`'s US2 was written for. The iOS bundle
   identifier is never shown to a user.
2. **The Android package is the harder half to change.** Both are permanent after publication, but the
   Play package is also the app's primary key in the store's URL space and in every link already shared.
3. **It matches the product, not the author.** It pairs with a `chromatictuner.*` canonical origin, which
   is the shape `003`'s FR-075 left to build configuration.

**Caveat carried into `tasks.md`**: Apple recommends, without enforcing, that a bundle identifier be the
reverse DNS of a domain the developer controls. Confirm `chromatictuner.com` (or the origin eventually
chosen for `VITE_SITE_URL`) is obtainable before first submission. Nothing breaks if it is not — the
identifier is still unique and still accepted — but the two would then disagree, which is the sort of
small permanent wart this decision exists to avoid.

**Alternative rejected**: `com.prielaidas.chromatictuner` on both. Safer against the domain caveat above
and scales to a second app under the same namespace. Rejected because it puts the author's handle in
every shared Play Store link for a product that is not named after the author.

**Superseded 2026-08-05 — the value is `pro.chromatictuner.app`.** The reasoning above stands
unchanged; only the string moved, and for a reason nothing here anticipated. `com.chromatictuner.app`
is **not obtainable**: Apple refuses to register it — "the app identifier cannot be registered to your
development team because it is not available" — which means another Apple account already holds it.
The decision treated availability as a given and checked only the *domain* caveat, which is the weaker
of the two constraints: a domain mismatch is a wart, an unavailable identifier is a hard stop, and it
surfaced only when a device build was first attempted rather than during planning.

`pro.chromatictuner.app` keeps every property argued for above — it is the product's name rather than
the author's, it is the same string on both platforms, and it reads as the reverse DNS of
`chromatictuner.pro`. It was verified free on Apple by registering it: Xcode issued
`iOS Team Provisioning Profile: pro.chromatictuner.app` and a Release build signed against it. **Google
Play is unverified**; that check moved into `listing/submission.md`'s open action 1, because a Play
package name is permanent even after an app is deleted, so a collision found after publishing cannot be
undone.

---

## D4 — Withdraw `supportsTablet`

**Decision**: Set `ios.supportsTablet` to `false`. Ship phone screenshots only.

**Rationale**: FR-099 forces this to be a decision rather than a default. Declaring tablet support
obliges a complete 13" iPad screenshot set and an interface that looks deliberate at that size. No
tablet layout has ever been designed — `001` and `002` specified and measured a phone-sized viewport,
and FR-018's no-scroll guarantee is stated against "the smallest supported screen", not the largest. A
centred readout scaled to 13 inches is not a tablet layout, and a screenshot of one is an argument
against installing.

The declaration is almost certainly a template default rather than an intent: nothing else in
`apps/mobile` acknowledges a tablet.

**Consequence, stated plainly**: iPad users get the phone app letterboxed. That is what they would get
from a tablet-declared app with no tablet layout anyway, minus the review risk and minus a screenshot
axis. Unlike D3, this is reversible at any time — a real tablet layout is a feature with its own spec,
and this decision is what stops it being half-claimed in the meantime.

---

## D5 — The icon is generated from tokens, and the web icons are regenerated with it

**Decision**: One generator emits every icon raster both stores and the web app need, from the palette
the build already emits. `apps/web/public/icon.svg` and `icon-maskable.svg` become generated outputs
rather than hand-authored files.

**Rationale — a latent defect found on the way past.** `apps/web/public/icon.svg` hard-codes five hex
values:

| Literal in `icon.svg` | Token it silently duplicates |
| --- | --- |
| `#0B0B0F` | `color.background.dark` |
| `#6B7280` | `color.line.dark` |
| `#34C46A` | `color.inTune.dark` |
| `#4C93F0` | `color.flat.dark` |
| `#FFC978` | `color.sharp.dark` |

It is a hand-transcribed copy of the dark palette. It passes every gate because the `apps/**` hex rule
is an ESLint rule and reaches TypeScript, not SVG in `public/` — the same class of gap `vite.config.ts`
already documents at line 114 for `index.html`, and the same shape as `003`'s D2 finding about runtime
style injection.

FR-098 forbids literal colours in listing artwork. Generating the mobile icons from tokens while leaving
the web icon hand-hexed would satisfy the letter of that and produce the worse outcome: two icons for
one product, free to drift, with a gate on only one of them.

**Alternative rejected**: generate only the mobile rasters and leave `apps/web/public/*.svg` alone.
Smaller diff, and it keeps the change inside this feature's stated boundary. Rejected because the
boundary is drawn around *the listing*, and the icon in the listing and the icon on the web app are the
same mark. Two sources for one mark is the defect, not the file count.

---

## D6 — Rasterisation reuses the installed Chromium and the built token block

**Decision**: `listing/scripts/generate-icons.mjs` renders an HTML template whose colours are
`var(--ct-*)` references, using the `<style>` block from `apps/web/dist/index.html`, and screenshots it
at each required size with the `@playwright/test` Chromium already installed.

**Rationale**: Identical to `generate-og-image.mjs`'s, and deliberately so — that script's header
already argues the whole case. Something must rasterise; every store wants PNGs at exact sizes; the
`<style>` block `siteIdentity()` emits carries every `--ct-*` value generated from
`@chromatic-tuner/tokens`; and `.mjs` cannot import the tokens package directly (D1). Lifting the style
block wholesale means the artwork cannot drift from the app's palette, on any Node version, with no
duplication to keep in step.

**Consequences**:

- `pnpm build` is a prerequisite of asset generation. Already true for `og:image`; documented in
  `quickstart.md`.
- Assets are **generated and committed**, regenerated deliberately rather than on every build — the
  precedent `e2e/fixtures/generate.mjs` and `og-image.png` both set. It keeps a browser launch out of
  the build path for files that change about once a year, and it makes the artwork reviewable in a pull
  request.

**Alternatives rejected**: `sharp` or a `resvg` binding (a native build for a job the toolchain already
does); raising the Node floor (see D1).

---

## D7 — Screenshots come from the real app, driven by a synthetic audio source

**Decision**: Capture from the real app running on a simulator and an emulator, with the `AudioSource`
port swapped for one that emits a generated tone. Capture with `xcrun simctl io booted screenshot` and
`adb exec-out screencap`; set appearance with `xcrun simctl ui booted appearance` and
`adb shell cmd uimode night`.

**Rationale**: FR-100 requires the real running app showing a real reading, and SC-039 requires the
process to reproduce. Those two pull against each other for a tuner, because a tuner with no signal
shows an empty state and a tuner with a real signal shows whatever the room is doing.

The port boundary already resolves this, and resolving it is what the boundary is for. Principle VI
requires every I/O boundary to sit behind a narrow interface with at least one test double;
`packages/core/testing/port-contract-tests.ts` and the existing doubles mean a synthetic `AudioSource` is
wiring, not new machinery. The app under capture is the real app — the real components, the real filter
chain, the real render path. Only the microphone is synthetic, and it is synthetic in exactly the way
the end-to-end suite's generated reference signals already are.

**Consequences**:

- Capture needs macOS with Xcode and an Android emulator, so it **cannot run on CI's Ubuntu runners**.
  Screenshots are generated and committed like `og-image.png`, and CI verifies the committed
  artefacts — presence, dimensions, format (FR-111). This is the same honest split `003`'s D8 made
  between what a gate can assert and what it can only pretend to.
- The capture build needs a flag. That is the one configuration option this feature adds, and it is
  recorded in the plan's Complexity Tracking rather than waved through.
- The flag must not reach a release build. `EXPO_PUBLIC_*` values are inlined at build time, so the
  gate asserts its absence from a release configuration rather than trusting the build to omit it.

**Alternatives rejected**:

- **Play a WAV through the host speakers into the simulator's microphone.** Zero code. Also
  non-deterministic, unreproducible, dependent on room noise and output volume, and it fails SC-039
  outright.
- **Route audio with a virtual device** (BlackHole or similar). Deterministic, but it is a system-level
  dependency every contributor must install, for a job the port boundary already does.
- **Screenshot the web app at phone viewports.** Cheapest of all, and dishonest: both apps mirror the
  same component structure but they are not the same shell, and a store screenshot showing browser
  chrome or web typography misrepresents the product. FR-100 says the real running app.

---

## D8 — Two gates, split by what each can honestly assert

**Decision**:

| Gate | Runs | Asserts |
| --- | --- | --- |
| `listing/scripts/verify-listing.mjs` (`pnpm verify:listing`) | CI, every PR | FR-109 field presence and limits · FR-110 forbidden vocabulary · FR-111 asset presence, dimensions, format · FR-112 cross-store and cross-surface agreement |
| `apps/web/e2e/metadata.spec.ts` (existing) | CI e2e | Unchanged, except its forbidden list now comes from `listing/out-of-scope-claims.json` |
| Manual release gates | Before submission | SC-036 and SC-040 human validation · SC-041 review outcome · SC-045 store search ranking |

**Rationale for moving the vocabulary**: `metadata.spec.ts:410` defines `OUT_OF_SCOPE` as thirteen
word-boundary regexes, with a comment explaining why word boundaries rather than substrings (`async`
contains `sync`; `accounting` contains `account`). The iOS listing and the Android listing are its
second and third consumers. Principle I places extraction at the third occurrence, not the second, and
this is it. The hazard is also asymmetric in a way that ordinary duplication is not: a term missing from
one copy of the list does not fail — it silently *permits* the claim it was written to forbid.

Stored as regex source strings in JSON, compiled with `new RegExp(src, 'i')` on both sides, so the one
format both consumers can read (D1) does not cost the word-boundary matching that makes the list usable.

**Rationale for what FR-112 compares**: the cross-surface check reads the **rendered text of
`apps/web/dist/index.html`**, not `apps/web/src/content.ts`. `003`'s `tasks.md` records the lesson in
its own words — *"`featureList` matches `content.ts` — passes trivially, both sides are the same
constant"* — and the same trap is available here. Comparing the listing against the built document
proves the two surfaces agree; comparing it against the constant that produces one of them proves
nothing.

**Rationale for the manual four**: a store's review verdict and a store's search ranking are outcomes of
systems this repository does not contain. Writing a green-reporting test for them would be worse than
having none, which is the judgement `003`'s D8 already made for structured-data validators and real
link-preview rendering.

---

## D9 — The privacy policy is a second Vite HTML entry

**Decision**: `apps/web/privacy.html` — prose in the served document, no React, added to Vite's
`build.rollupOptions.input`.

**Rationale**: It is the same problem `003`'s D1 solved and the same answer. The content is immutable
prose that must be readable by a store reviewer, a crawler, and a person, none of whom should need to
execute a script to read a privacy policy.

Three things already work in its favour: `siteIdentity()`'s `transformIndexHtml()` has no filter, so a
second HTML entry inherits the token `<style>` block and canonical handling with no change; `003`'s
FR-073 named `sitemap.xml` as the registration point for exactly this; and the precache plugin's
explicit array already documents why its list is maintained by rule rather than by accident.

**Two places must be told about the new page**, and both are the kind of omission that ships quietly:

1. `sitemapXml()` in `vite.config.ts` — otherwise the policy is unlisted.
2. The precache array at `vite.config.ts:528`, currently
   `['/', '/index.html', '/manifest.webmanifest', '/icon.svg', ...assets]` — otherwise the policy is the
   one page that breaks offline, and FR-030's guarantee gets a hole in it.

**Alternatives rejected**:

- **A route inside the SPA.** Needs a router `003`'s D10 explicitly declined to invent, and produces a
  policy page that a store reviewer must run scripts to read.
- **Host the policy on a third-party page** (a gist, a notion page, a generator's hosted URL). An address
  the project does not control, for a link both stores require to keep resolving for the life of the app.

---

## D10 — Version and build numbering

**Decision**: The marketing version comes from `apps/mobile/package.json`. `ios.buildNumber` and
`android.versionCode` derive from a single integer constant in `app.config.ts`, incremented by hand per
submission, with the rule stated in `listing/submission.md`.

**Rationale**: A third disagreement to clean up while D2 is open — `apps/mobile/package.json` says
`0.0.0` and `app.json` says `0.1.0`. One integer feeding both platforms means a resubmission of an
unchanged version cannot produce a build number that one store accepts and the other rejects (FR-107).

**Alternative rejected**: EAS `autoIncrement`. It is the right answer the day there is a build service,
and a build service is release engineering, which the spec puts out of scope. A hand-incremented integer
with a written rule is the smallest thing that satisfies FR-107 today (Principle II).
