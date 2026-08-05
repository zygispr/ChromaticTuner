# Implementation Plan: App Store Listing Optimisation

**Branch**: `004-app-store-listings` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-app-store-listings/spec.md`

## Summary

Give the iOS and Android shells a listing: copy a shopper can find and understand (US1), an icon and
screenshots that read as a tuner (US2), the declarations both stores require before they will accept a
microphone app (US3), and gates that keep all of it true (US4).

The shape of Phase 0 is different from `003`'s. There the dominant finding was that the expected
solution was wrong; here the expected solutions are mostly right, and the dominant finding is that
**this feature's real work is de-duplication**. Three facts about the app are currently written down in
more than one place, with nothing keeping them in step, and every one of them is a fact a store listing
also has to state:

| Fact | Written in | This feature |
| --- | --- | --- |
| The microphone purpose sentence | `app.json` twice (`ios.infoPlist`, plugin config); would become four copies with two listings | One source, read by `app.config.ts` (**D2**) |
| The dark palette | `packages/tokens` and, hand-transcribed as five hex literals, `apps/web/public/icon.svg` | Icons generated from the palette the build emits (**D5**, **D6**) |
| The app's version | `apps/mobile/package.json` says `0.0.0`, `app.json` says `0.1.0` | One version, one build integer (**D10**) |

A fourth is the reason the identifier question came up at all: the two shells disagree about their own
identity, and `apps/mobile/ios/` being gitignored means that disagreement has exactly one tracked
occurrence to fix (**D3** — both become `com.chromatictuner.app`).

The one genuinely new mechanism is screenshot capture (**D7**): the real app on a simulator and an
emulator with the `AudioSource` port swapped for a synthetic tone, so a screenshot shows a real reading
and reproduces. That is the feature's only added configuration option and its only Complexity Tracking
entry.

**No new dependencies.** **No change to `packages/core`, `packages/react`, or `packages/tokens`.**
Nothing here touches pitch detection, the filter chain, the accuracy budget, or the discrete/continuous
channel split — FR-113 makes that a requirement rather than an intention.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` — unchanged. Listing data is JSON, because the
gate that reads it is `.mjs` and CI pins Node 20, which predates type stripping (**D1**).

**Primary Dependencies**: Expo 57 / React Native 0.86 (mobile), Vite 8 / React 19 (web). **No new
dependencies.** D6 rasterises with the `@playwright/test` Chromium already installed; D7 captures with
`xcrun simctl` and `adb`, both already required to build the app at all.

**Storage**: unchanged. This feature persists nothing at runtime. Listing copy, limits, and the
forbidden vocabulary are build- and release-time data.

**Testing**: `listing/scripts/verify-listing.mjs` as a root `pnpm verify:listing` gate, following the
`verify:offline` precedent — a standalone Node script rather than a new Vitest project, because the root
Vitest config's `projects` is `packages/*` only and this check spans two apps and the web build output.
`apps/web/e2e/metadata.spec.ts` keeps its existing assertions and sources its forbidden list from the
shared file (**D8**). Four checks stay manual release gates because no honest automation exists for
them: SC-036 and SC-040 human validation, SC-041 review outcome, SC-045 store search ranking.

**Target Platform**: iOS 16.4+ and Android 8+ (constitution's supported targets). New consumers of the
same app are two store review processes and two store search indexes.

**Project Type**: pnpm workspace. This feature touches `apps/mobile`, a small amount of `apps/web` (the
privacy page and the generated icons), and adds a root `listing/` directory.

**Performance Goals**: unchanged and untouched. Nothing in this feature runs while the app is tuning.
The constitution's before/after measurement obligation for DSP and render changes is not triggered —
FR-113 and SC-044 exist to keep that true rather than merely likely.

**Constraints**: Three, all of which have already bitten this repo in a related form.
**Node 20 in CI** forecloses importing TypeScript from any generator or gate (D1, D6). **`.mjs` cannot
read the tokens package**, so artwork colour comes from the built document's `<style>` block, exactly as
`generate-og-image.mjs` does. **Screenshot capture cannot run on Ubuntu**, so assets are generated,
committed, and verified rather than built in CI — the split `003` already made for `og-image.png`.

**Scale/Scope**: 4 user stories, 26 requirements (FR-088–FR-113), one new root directory, roughly a
dozen touched files. No new packages, no new screens, no new runtime state, no change to any tuner
behaviour.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Code Quality** | The feature is net de-duplication: one purpose sentence instead of two heading for four (D2), one palette instead of two (D5), one version instead of two (D10), one identifier instead of two (D3). `OUT_OF_SCOPE` moves out of a Playwright spec on its third consumer, which is precisely where Principle I places extraction — and its failure mode is asymmetric, since a term missing from one copy silently permits the claim it forbids (D8). No suppressed warnings. | PASS |
| **II. Simplicity** | Zero new dependencies. D1 rejects a TS loader and a Node bump; D6 rejects `sharp`/`resvg`; D7 rejects a virtual audio device; D9 rejects a router `003` already declined to invent; D10 rejects EAS auto-increment as belonging to a build service that is out of scope. D1 rejects the fastlane metadata tree specifically as building for an automation step the spec excludes. One configuration option is added (D7's capture flag) and it is recorded in Complexity Tracking, not waved through. | PASS, with one justified entry |
| **III. Testing (NON-NEGOTIABLE)** | Every requirement with an observable outcome gets a gate, and D8 names the four that genuinely cannot be automated honestly instead of writing weaker tests that report green. The specific trap here is inherited and named: FR-112 compares the listing against the **built document's rendered text**, not against `content.ts`, because comparing two references to one constant passes trivially — `003`'s `tasks.md` records that exact lesson. SC-043 requires four gates be observed failing before they are trusted. | PASS |
| **IV. UX Consistency** | The app icon becomes a first-party designed mark rather than a framework placeholder, generated from the same tokens the app renders (D5), which closes a real gap: `icon.svg`'s five hex literals escape the `apps/**` lint rule because that rule reaches TypeScript, not SVG. Screenshots must cover both appearances (FR-101). D4 withdraws a tablet claim rather than shipping a listing that half-supports one. The privacy page is subject to the same contrast, text-size, and appearance obligations as everything else. | PASS |
| **V. Performance** | Nothing here is on the audio path or the render loop. D7's synthetic `AudioSource` runs only in a capture build and must be proven absent from a release build. FR-113 and SC-044 make "no behaviour changed" a verified claim rather than an assumption. | PASS, no measurement obligation triggered |
| **VI. Scalability** | Dependencies still point inward only; `packages/*` is consumed, not modified. D7 is a straightforward use of the port boundary the constitution requires for exactly this reason ("at least one test double"). D9 registers the new page in `sitemap.xml`, which is what `003`'s FR-073 built it for. The `listing/` directory is data and scripts, not a layer. | PASS |

**One violation, justified below.** See Complexity Tracking.

Four obligations this gate creates, carried into `tasks.md`:

1. **Four gates must be observed failing before they are trusted** (SC-043): an over-limit field, an
   emptied field, a deleted asset, a forbidden claim. A gate never seen red is not known to work.
2. **The capture flag must be proven absent from a release build**, not assumed absent. `EXPO_PUBLIC_*`
   values are inlined at build time, so this is an assertion about build output.
3. **FR-112 compares rendered output, not constants.** Stated here as well as in D8 because it is the
   single assertion in this feature most likely to be written the trivially-passing way.
4. **The privacy page needs a screenshot in both appearances** (Development Workflow: pull requests
   touching the UI include light and dark screenshots).

## Project Structure

### Documentation (this feature)

```text
specs/004-app-store-listings/
├── plan.md                  # This file
├── research.md              # Phase 0 output — D1–D10
├── data-model.md            # Phase 1 output — the listing record and its sources
├── quickstart.md            # Phase 1 output — V30–V38 validation scenarios
├── contracts/
│   └── store-listing.md     # Phase 1 output — L1–L12, what the artefacts must satisfy
├── checklists/
│   └── requirements.md      # From /speckit-specify
└── tasks.md                 # NOT created by /speckit-plan
```

### Source Code (repository root)

Files this feature touches. Everything else is untouched — notably all of `packages/`, every component
in `apps/mobile/src/components`, and the whole audio path.

```text
listing/                                  # NEW — release artefacts, not app source
├── store-listing.json                    # NEW: copy for both stores, one set of claims (D1, FR-088)
├── limits.json                           # NEW: per-store field limits, one place (FR-109)
├── out-of-scope-claims.json              # NEW: forbidden vocabulary, shared with web e2e (D8, FR-110)
├── submission.md                         # NEW: artefact → console field map (FR-108)
├── assets/
│   ├── icon-ios-1024.png                 # NEW: generated, committed — square, no alpha
│   ├── icon-play-512.png                 # NEW: generated, committed
│   ├── icon-adaptive-foreground.png      # NEW: generated, committed — safe-zone composed
│   ├── feature-graphic-1024x500.png      # NEW: generated, committed — Play requires it
│   └── screenshots/{ios,android}/{light,dark}/*.png   # NEW: captured, committed (D7)
└── scripts/
    ├── generate-icons.mjs                # NEW: rasterises from the built token block (D6)
    ├── capture-screenshots.mjs           # NEW: simulator + emulator capture (D7)
    └── verify-listing.mjs                # NEW: the gate (D8, FR-109–FR-112)

apps/mobile/
├── app.json                              # DELETED — replaced by app.config.ts (D2)
├── app.config.ts                         # NEW: derives name, identifier, version, purpose strings
├── package.json                          # CHANGED: marketing version (D10)
└── src/
    ├── App.tsx                           # CHANGED: capture-build AudioSource selection (D7)
    └── adapters/captureAudioSource.ts    # NEW: synthetic tone source, capture builds only (D7)

apps/web/
├── privacy.html                          # NEW: privacy policy, prose in the document (D9)
├── vite.config.ts                        # CHANGED: second input, sitemap entry, precache entry (D9)
├── public/icon.svg                       # CHANGED: generated rather than hand-hexed (D5)
├── public/icon-maskable.svg              # CHANGED: same
└── e2e/metadata.spec.ts                  # CHANGED: forbidden list now read from listing/ (D8)

package.json                              # CHANGED: verify:listing, listing:assets scripts
.github/workflows/ci.yml                  # CHANGED: verify:listing step
```

**Structure Decision**: A root `listing/` directory, not a subdirectory of `apps/mobile`.

Three of its files are not mobile-only. `out-of-scope-claims.json` is read by the web end-to-end suite
as well as by the listing gate. `verify-listing.mjs` reads `apps/web/dist/index.html` to satisfy FR-112.
`generate-icons.mjs` writes into `apps/web/public/` as well as `listing/assets/`. Filing cross-app
artefacts under one app would put the web build's inputs inside the mobile app's directory, which is a
worse lie than a fourth top-level directory beside `apps/`, `packages/`, and `specs/`.

It is also not app source. Nothing in `listing/` is bundled, imported by a component, or present at
runtime on any platform — `app.config.ts` reads the JSON in Node during prebuild, which is why D2 works
at all in a workspace where Metro cannot resolve pnpm's symlinks. Keeping release artefacts out of
`apps/*/src` is what makes that distinction visible.

## Complexity Tracking

One violation. Recorded rather than argued away.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **A build-time configuration option** (`EXPO_PUBLIC_*` capture flag) selecting a synthetic `AudioSource`, against Principle II's "configuration options MUST NOT be built until a current requirement demands them" | FR-100 demands a screenshot of the real running app showing a real reading, and SC-039 demands the process reproduce. A tuner with no signal shows an empty state; a tuner with a live microphone shows the room. The flag is the seam between those two requirements, and it exists only in a capture build. | **Route real audio into the simulator** (host speakers, or a virtual device like BlackHole): non-deterministic and unreproducible in the speaker case, a system dependency every contributor must install in the virtual-device case — for a job the port boundary the constitution already mandates does natively. **Ship without screenshots**: both stores require them. **Screenshot the web app**: misrepresents the product, and FR-100 says the real running app. The option is one boolean read at one call site, and the gate asserting its absence from release builds is itself a deliverable (obligation 2 above). |

## Post-Design Constitution Re-check

Re-evaluated after `data-model.md` and `contracts/store-listing.md` were written.

- **No new abstraction appeared during design.** The listing "record" in the data model is a description
  of a JSON file's shape, not a runtime type, a factory, or a registry. `app.config.ts` is a function
  returning an object, which is Expo's own mechanism, not a layer invented here.
- **The design removed more than it added.** Counting sources of truth: the purpose sentence goes from
  two to one, the palette from two to one, the version from two to one, the identifier from two to one,
  and the forbidden vocabulary from one-about-to-be-three to one. Against that, one new directory of
  data and three scripts.
- **Writing the contract surfaced two risks and gated both.** Play's screenshot aspect-ratio rule
  constrains which device profile may be used for capture, and a plausible emulator default does not
  satisfy it — so L8 makes the accepted ranges data in `limits.json` rather than folklore in a script,
  and the gate checks captured dimensions against it. Separately, the precache array is a hand-maintained
  list whose own comment records what happens when such a list is maintained by hand; L11 asserts the
  privacy page is in it rather than trusting the edit.
- **The Complexity Tracking entry did not grow.** It remains one boolean at one call site. Design did not
  find a second thing wanting configuration.
- **Verdict: PASS, with the single justified violation above unchanged.**
