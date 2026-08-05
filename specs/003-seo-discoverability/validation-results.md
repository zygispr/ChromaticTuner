# Validation Results: Search & Answer-Engine Discoverability

**Date**: 2026-08-05 · **Against**: [quickstart.md](./quickstart.md) V22–V29 · **Task**: T060

Run on a development Mac (Apple silicon, macOS 26.5.2), Node 24.14.0, pnpm 11.18.0, headless Chromium via
Playwright, on `51dea83` plus this file, the Phase 7 log, and the screenshots.

`001`'s **V1–V13** and `002`'s **V14–V21** all remain in force and were re-run as part of the gate suite.

This feature has **no mobile half**. `packages/*` and `apps/mobile` are untouched, which is why the unit
and Jest counts are unchanged while the end-to-end count grew by nearly half.

## Summary

| Suite | Result |
| --- | --- |
| Unit (`pnpm test`) | **430 passed**, 18 files |
| Mobile (`jest-expo`) | **64 passed**, 9 suites |
| End-to-end (`pnpm test:e2e`) | **107 passed** (75 before the feature) |
| `packages/core` coverage | **100% lines**, 98.5% statements, 94.81% branches, 97.29% functions |
| `verify:build-output` | pass |
| `verify:offline` | pass — cold 836 ms, warm 303 ms, offline 305 ms |
| Ten quality gates | all green |

Growth over the feature: **+32 end-to-end**, 0 unit, 0 mobile. Zero new dependencies.

---

## Scenario results

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| V22 | Content is served, not rendered | ✅ pass | Both halves. `no-script.spec.ts` runs with `javaScriptEnabled: false` and finds the `<h1>`, the meta description and every section heading and body visible. The byte-level half reads the served HTML as text and finds the same strings — the half that actually tests P1's "before any script executes", since the Playwright half only proves a browser displays it. **254 words** of supporting content, one `<h1>`, sections at `<h2>`. Nothing is produced by a build-time render of the React tree: the JavaScript bundle has been byte-identical for four phases. |
| V23 | The tuner still owns the fold | ✅ pass | `fold.spec.ts` measures real bounding boxes at 360×640 with `scrollY === 0` — geometry, not DOM order. `#root` is exactly one viewport height; every element of the tuning display and both controls is inside it. Scroll restoration is pinned separately: scroll to the content, reload, `scrollY === 0`. **The growth case was observed failing** (SC-032) — see [Gates observed failing](#gates-observed-failing). |
| V24 | Page identity is complete and its assets resolve | ✅ pass | `metadata.spec.ts` asserts every tag in contract §2/§3 present and non-empty, canonical absolute with **no `%` character**, `og:image` absolute, `200`, and a PNG of exactly 1200 × 630 read from the IHDR header bytes. **Demonstrated failing for three items** (SC-031) — see below. Asset reachability rejects a `200 text/html` response as well as a non-200, because the dev server answers any missing path with the app shell. |
| V25 | Structured description validates and is corroborated | ✅ pass | Exactly one `application/ld+json`; parses; `@type: SoftwareApplication`; `offers.price: "0"` with `priceCurrency`; `applicationCategory`, `operatingSystem`, `url` present. Every one of the five `featureList` entries is found in `document.body.innerText` — the **rendered** text, not `content.ts` and not the HTML source. No denylisted out-of-scope term (presets, Drop D, DADGAD, capo, metronome, sign-in, sync, …) appears anywhere in the authored copy. Both checks were verified against planted failures. |
| V26 | Offline still works and crawler files are not cached | ✅ pass | `verify:offline` green on all three starts. `robots.txt` and `sitemap.xml` exist in `dist/` and match **zero times** in `dist/sw.js`. Precache manifest is exactly `["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/index-*.js"]`. The exclusion is a rule over emitted file extensions, not a list of two filenames, so a future `ads.txt` or feed is covered without anyone remembering. |
| V27 | Appearance and accessibility of the new section | ⚠️ **pass, one leg open** | **Automated**: Axe reports no violations scoped to `#site-content` in **both** appearances — Axe measures the composited result, which is what caught `001`'s 3.9:1 text behind a correct token. Headings in order, zero focusable elements in the content. **Human legs**: screenshots captured and reviewed (T055); scroll cue non-overlapping with 5 px of clearance, 3 px at the largest text setting; keyboard traversal confirmed; installed-app identity confirmed. **SC-030's unfamiliar-reader check is not done** — see [Still open](#still-open). |
| V28 | Public validators | ⛔ **blocked** | Needs a deployed URL. Not skipped — a release gate. See [Still open](#still-open). |
| V29 | Real link previews and indexation | ⛔ **blocked** | Needs a public address. Not skipped — a release gate, with a deployment checklist in [tasks.md](./tasks.md#deployment-checklist-t057). |

---

## Gates observed failing

A gate never seen failing is not known to work, and SC-031 and SC-032 make that an explicit deliverable
rather than a nicety. Five gates in this feature were made to fail deliberately.

**SC-032 — the fold gate, against encroachment.** A 400 px block prepended to the tuner column pushes
elements out of the fold and the gate reports them by name. The first version of this probe prepended to
`<main>` instead and reported that nothing moved — `<main>` is a flex **row**, so the filler landed
*beside* the tuner. The probe was wrong, not the gate.

**SC-031 — three identity items removed, each naming what is missing.**

| Broken | Message |
| --- | --- |
| meta description removed | `no meta description in the served document` + `og:description disagrees with the meta description` |
| canonical emptied | `no <link rel="canonical"> in the document` + `the sitemap lists more than the one real page` |
| `og-image.png` renamed | `these referenced assets do not resolve: …/og-image.png → served the app shell (text/html), so the file itself is missing` |

**The corroboration and denylist gates**, which pass on the real content by construction and so could
otherwise never have been trusted:

```text
these claims appear in the markup but nowhere a reader can see them:
  detects all six strings simultaneously

the page claims capabilities 001 put out of scope:
  /\btuning presets?\b/i, /\bdrop\s*d\b/i, /\bcapo\b/i
```

**The precache exclusion**, with the filter removed:

```text
the service worker precaches crawler-only files: robots.txt, sitemap.xml
  — exclude them from the manifest
```

### Two defects the deliberate breakage found, in the gates themselves

Both are the reason T048 was worth doing rather than ticking.

**A missing tag cost 30 seconds and named nothing.** A Playwright locator *waits* for its element, so an
assertion reaching for an absent meta tag times out instead of failing. It reports
`locator.getAttribute: Test timeout of 30000ms exceeded` — which does not name the missing item, and
FR-084 requires that it does. Fixed in `metadata.spec.ts` during Phase 4 (whole file: 32.9 s → 3.6 s), and
the same defect was found surviving in `no-script.spec.ts` during Phase 6 and fixed there too.

**A status-only reachability check passed for every conceivable URL.** The dev server answers a missing
path with `200` and the app shell:

| Request | Response |
| --- | --- |
| `/og-image.png` | `200 image/png` |
| `/icon.svg` | `200 image/svg+xml` |
| `/does-not-exist.svg` | **`200 text/html`** |

So FR-085's gate, as first written, could not fail. It now rejects an HTML content type as well as a
non-200. This is the same soft-404 behaviour research D10 records as a deployment obligation — the gate
found it locally, and the fix for production is in the deployment checklist.

---

## Principle V: before and after

Cold start is the only budget this feature can move: it adds document bytes (slower) and removes a runtime
style-injection step (faster).

| Measurement | Before | After | Verdict |
| --- | --- | --- | --- |
| Cold start, **production build**, median of 5 | 875 ms (`002`) | **840 ms** | unchanged; budget 2000 ms |
| Cold start, dev server, median of 5 isolated | 141.5 ms | 109.7 ms | **within noise** (±65 ms band) |
| `dist/index.html` | 669 B | 7,454 B | +6,785 B |
| `dist/assets/*.js` | 236,213 B | **235,516 B** | **−697 B** |
| `dist/` total, maps excluded | 241,489 B | 269,623 B | +28,134 B, of which 21,685 B is the card image |
| Frame time p50 / p95 | 8.3 / 9.2 ms | 8.0 / 9.8 ms | unchanged; gates are 17.5 / 33.4 ms |

**SC-028 passes on the production artefact**, at 42% of the budget with the same headroom `002` left.

Two things about how this was measured, because both would corrupt a future comparison:

**The dev-server instrument is five times noisier than the one already in the repo.** T002 built a
cold-start measurement inside `performance.spec.ts` because none existed. It works, and it is the only
version that can run per-commit — but its spread is 63.5 ms against `verify:offline`'s 5 ms, and it
measures `pnpm dev` rather than a production build. SC-028 should be read off `verify:offline`; the e2e
timing is a cheap sentinel for detecting a regression between two commits.

**Concurrency moves the dev-server number by more than any plausible change under test.** Running
`performance.spec.ts` under `fullyParallel` gave 333.9 ms against ~141 ms isolated — 2.4×. Any future
comparison must re-measure the same way (isolated, `-g "cold-start"`, five runs, compare medians) or it
will report a phantom regression of ~190 ms that is purely test-harness load.

**The bundle got smaller.** D2 moved the theme's token block out of the app's module graph and into
build-time markup — the same bytes, relocated from script that must execute into markup that does not. Of
the bytes added to `dist/`, three quarters are the preview card, which lives in `public/`, never enters
Rollup's bundle object, is never precached, and is downloaded only by crawlers and link-preview services.

---

## The fold has three pixels of slack, not ten

Phase 3 recorded that the tuner column measures 582 px inside 592 px of available height at 360×640 — ten
pixels — and that the scroll cue had to fit the gap that already existed rather than reserve new space.
T056 measured the same thing at the largest text setting a browser will apply.

Everything in this app is sized in `px`, so a platform text-size preference does not scale it. The setting
that *does* bite is Blink's `minimumFontSize`, which forces a floor: at Chrome's maximum
(`defaultFontSize=24, minimumFontSize=24`) the direction cue and the content body grow 16 → 24 px while the
note label and cents readout, both already above the floor, do not move. The fold still fits — and the
cue's clearance over the microphone control drops from **5 px to 3 px**.

Anything added inside the fold from here should be measured at that setting, not only at the default.

### Page zoom, and why it is recorded rather than fixed

Modelling browser zoom as a shrinking CSS viewport — a 360×640 phone at 125% presents 288×512 — the tuner
column stays 582 px tall, because it is a stack of `px`-sized children and cannot shrink. So below roughly
630 px of viewport height the microphone control falls below the fold.

**Probed rather than assumed: nothing is clipped and nothing is unreachable.** At 288×512 `#root` is
512 px, `<main>` is 630 px, and the document scrolls; scrolling 200 px brings the control fully into view.
`<main>`'s `overflow: hidden` clips nothing here — its own `scrollHeight` equals its height.

**This is not something `003` introduced.** The feature adds nothing inside `#root` (document order is
`root → script → scroll-cue → site-content`), T011's height changes were deliberately not made, and T012
was deliberately not done — removing `overflow: hidden` from `TunerLayout` would have risked the
*horizontal* overflow that FR-018 forbids, to satisfy a premise (research D3) that measurement showed was
false. FR-066 and SC-029 are stated at the smallest *supported* viewport, where the tuner fits. Recorded
as a known limit, not as a regression and not as a task.

---

## Still open

| Gap | Scenario | Status |
| --- | --- | --- |
| **An unfamiliar reader can tell content continues below the fold** | V27, SC-030, T056 | ❌ **open.** This is a person, not a measurement, and the method `002` used for V20 was to hand the app to someone who had not seen it. Everything that enables it is established — the cue is present, visible at `opacity: 1`, correctly coloured, and overlaps nothing at 360×640 — but whether it *reads* as "there is more below" to a first-time viewer is untested. |
| **Public schema validators and Lighthouse SEO** | V28, SC-025, SC-026 | ⛔ **blocked on deployment.** Rich Results Test and the Schema.org validator take a URL, not a file. Deliberately not in CI (research D8): rate-limited third-party network calls make a flaky gate. Everything they would check is asserted locally, so they should confirm rather than discover. |
| **Real link previews on real platforms** | V29, SC-024 | ⛔ **blocked on deployment.** The tags are proven present, absolute, mutually consistent, and the image proven a real 1200 × 630 PNG that resolves — which is the most a laptop can prove. Whether the text inside the card is legible at the ~300 px each platform renders it (V-IMG-2) is a human judgement no dimension check substitutes for. |
| **Canonical indexed, no preview address beside it** | V29, SC-033 | ⛔ **blocked on deployment**, and on 30 days after it. |
| **`robots.txt` disallows on a preview deployment** | V29 step 4, FR-076 | ⚠️ **open, and quickstart V29 step 4 is wrong as written.** The check is `siteOrigin !== DEVELOPMENT_ORIGIN`, so any origin other than localhost gets an allow-all robots. The fail-safe protects the *forgotten* variable — which `verify:build-output` tests — not a *deliberately different* one. Preview deployments must leave `VITE_SITE_URL` unset. In the [deployment checklist](./tasks.md#deployment-checklist-t057). |
| **Unknown paths return 404 rather than the app shell** | research D10 | ⚠️ **open by design, a hosting obligation.** Not fixable in the app: the service worker serves the cached `index.html` for any in-scope navigation, and the app has one real URL and no router. Measured locally at `200 text/html` for a missing path. In the deployment checklist. |
| **On-device cold start on the lowest supported target** | SC-028 | ❌ **open**, carried from `001`. The 840 ms figure is a headless Chromium on an Apple-silicon Mac against a local preview server. The 2 s budget is stated for the lowest supported target device, which remains a release gate on real hardware alongside V13's thermal check. |

Carried forward unchanged from `001` and `002`: on-device V7/V8, mobile airplane mode, V13 on mid-range
hardware, VoiceOver and TalkBack, Safari confirmation, and the Android build. None of them are touched by
this feature — it adds no mobile surface at all.
