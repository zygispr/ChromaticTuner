# Implementation Plan: Search & Answer-Engine Discoverability

**Branch**: `003-seo-discoverability` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-seo-discoverability/spec.md`

## Summary

Make the web tuner findable: put real content in the served document (US1), give the link a preview
identity (US2), describe the app in machine-readable form (US3), and gate all of it so it cannot rot
(US4).

The dominant finding of Phase 0 is that **the expected solution is the wrong one**. Every guide for
"client-rendered SPA has no indexable content" prescribes prerendering or server rendering. This app
needs neither, because the content that must be indexed was never React's to render. The tuner is one
interactive widget whose visible state depends entirely on microphone permission and live audio; the
supporting content is immutable prose. Put the prose in `index.html` as prose, keep React mounting into
`#root`, and FR-060 is satisfied with no hydration boundary, no second render path, and no new
dependency (research **D1**).

What that reveals is a latent defect the feature must fix on the way past: the theme's CSS custom
properties are built by JavaScript and appended to `<head>` at runtime. Nothing notices today because
nothing exists on the page until that JavaScript runs. The moment static content sits in the document,
it renders unstyled for a crawler and flashes for a real user — so the token block moves to build time
(**D2**), which also removes a step from the cold-start path.

The other structural change is that the page scrolls for the first time (**D3**). Three rules currently
make the document unscrollable; the content would otherwise be present in the DOM and unreachable by a
human.

**No new dependencies. No change to `packages/core`, `packages/react`, `packages/tokens`, or
`apps/mobile`.** Nothing here touches pitch detection, the filter chain, the accuracy budget, or the
discrete/continuous channel split.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` — unchanged

**Primary Dependencies**: React 19, Vite 8 (web). **No new dependencies.** D7 rasterises the preview
image with the `@playwright/test` Chromium already installed as a devDependency, rather than adding an
image library.

**Storage**: unchanged. This feature persists nothing. `VITE_SITE_URL` is build configuration, not
runtime state.

**Testing**: Playwright + Chromium (`apps/web/e2e`) — the only place a web-app assertion can live, since
the root Vitest config's `projects` is `packages/*` only. Three new specs (D8). Two checks stay manual
release gates: public structured-data validators and real link-preview rendering, both of which require
network calls to third-party services or a deployment that does not exist yet.

**Target Platform**: evergreen browsers. Crawlers and link-preview generators are new consumers of the
same document, most of which execute no JavaScript.

**Project Type**: pnpm workspace; `packages/*` platform-free, `apps/*` thin platform shells. This feature
is entirely inside `apps/web`.

**Performance Goals**: unchanged and binding — ≤2 s cold start, 60 fps sustained, ≤100 ms audio-to-display
p95. D2 is a small net improvement to cold start (one fewer runtime step); nothing else here is on a hot
path.

**Constraints**: Two existing guarantees are what this feature can most easily break, and both are
gated. **FR-018** — the tuning display fully usable without scrolling on the smallest supported screen —
is threatened by content that grows over time, so `fold.spec.ts` measures real bounding boxes against the
real viewport. **FR-030** — offline operation — is threatened by the precache manifest sweeping up
crawler-facing files, so the manifest gains an explicit exclusion rule and `verify:offline` proves it.

**Scale/Scope**: 4 user stories, 28 requirements (FR-060–FR-087), ~12 files in `apps/web`. No new
packages, no new screens, no new runtime state.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Code Quality** | No suppressed warnings. D2 deletes a runtime side effect from `main.tsx` and replaces it with a declarative build step — a net reduction. D4 removes a heading whose text ("Tune by ear-free listening") named no searchable concept and whose element unmounted, leaving the page with zero `<h1>` in its steady state. Content strings live in one module (D6) rather than being duplicated between markup and JSON-LD. | PASS |
| **II. Simplicity** | The whole shape of the feature is a Principle II decision: D1 rejects prerendering, SSR, a static-site framework, and dynamic-rendering services in favour of static markup. D6 rejects `llms.txt` on measured-benefit grounds. D7 rejects an image dependency in favour of the installed Chromium. D10 declines to invent a router to produce 404s. **Zero new dependencies.** | PASS |
| **III. Testing (NON-NEGOTIABLE)** | Every requirement with an observable outcome gets a failing test first. D8 names the three specs and, importantly, names the two checks that genuinely cannot be automated honestly rather than writing a weaker test that reports green. The fold gate measures bounding boxes, not DOM order — the lesson `e2e/helpers.ts` already records. | PASS |
| **IV. UX Consistency** | The page gains a visible section, so it is subject to the same obligations as everything else: both appearances, AA contrast, text-size and reduced-motion preferences (FR-070). D2 is what makes the new content themed at all. The scroll cue (FR-068) must not overlap controls. Verified by the existing `appearance.spec.ts` and `a11y.spec.ts`, extended to the new section. | PASS |
| **V. Performance** | Nothing here is on the audio path or the render loop, so the constitution's before/after measurement obligation for DSP/render changes is not triggered. Cold start *is* touched: D2 removes a runtime style-injection step (small improvement) and the static content adds bytes to the document (small cost). Net effect must be measured against the 2 s budget — SC-028. | PASS, with a cold-start measurement obligation |
| **VI. Scalability** | Dependencies still point inward only. `packages/*` is consumed, not modified. `sitemap.xml` is the registration point if a future feature adds a page. The one thing worth flagging: `vite.config.ts` importing `src/theme.ts` is an app-internal build-time import, not a new layer. | PASS |

**No violations. Complexity Tracking section omitted — nothing to justify.**

Three obligations this gate creates, carried into `tasks.md`:

1. **Cold start must be measured before and after** (Principle V, SC-028). D2 and the added document
   bytes both land on it, in opposite directions.
2. **The new content section must be screenshotted in both appearances** (Development Workflow: "Pull
   requests touching the UI MUST include a screenshot or recording in both light and dark appearance").
3. **The fold gate must measure geometry, not structure.** Asserting the content section follows the
   tuner in DOM order proves nothing about whether the tuner still fits. This repo has already shipped
   one defect of exactly that shape for seven phases.

## Project Structure

### Documentation (this feature)

```text
specs/003-seo-discoverability/
├── plan.md              # This file
├── research.md          # Phase 0 output — D1–D10
├── data-model.md        # Phase 1 output — the page identity record and its sources
├── quickstart.md        # Phase 1 output — V22–V29 validation scenarios
├── contracts/
│   └── page-identity.md # Phase 1 output — what the built document must expose
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # NOT created by /speckit-plan
```

### Source Code (repository root)

Files this feature touches. Everything else in the tree is untouched — notably all of `packages/` and
all of `apps/mobile`.

```text
apps/web/
├── index.html                      # CHANGED: static content, <h1>, metadata, JSON-LD, %VITE_SITE_URL%
├── .env                            # NEW: committed development default for VITE_SITE_URL (D5)
├── vite.config.ts                  # CHANGED: theme <style> injection (D2), robots/sitemap
│                                   #          emission (D5/D9), precache exclusion rule (D9)
├── package.json                    # CHANGED: og-image generation script
│
├── src/
│   ├── content.ts                  # NEW: single source for copy + JSON-LD field values (D6)
│   ├── theme.ts                    # CHANGED: themeCss consumed by the build, not by main.tsx
│   ├── main.tsx                    # CHANGED: drop style injection, height rules, scrollRestoration
│   └── components/
│       ├── templates/TunerLayout.tsx        # CHANGED: drop overflow:hidden (D3)
│       └── molecules/PermissionPrompt.tsx   # CHANGED: demote <h1> (D4)
│
├── scripts/
│   └── generate-og-image.mjs       # NEW: renders 1200×630 via installed Chromium (D7)
│
├── public/
│   ├── og-image.png                # NEW: generated, committed (D7)
│   └── manifest.webmanifest        # CHANGED: lang, dir, categories, screenshots (FR-080)
│
└── e2e/
    ├── metadata.spec.ts            # NEW: page identity + asset reachability (FR-084/085)
    ├── no-script.spec.ts           # NEW: served content with JS disabled (FR-060)
    ├── fold.spec.ts                # NEW: tuner owns the viewport (FR-066/087)
    ├── appearance.spec.ts          # CHANGED: extend to the content section
    └── a11y.spec.ts                # CHANGED: extend to the content section (FR-070/071)
```

**Structure Decision**: Entirely within `apps/web`. This is a property of the served document and its
build, and the constitution's layering rule points the other way — a discoverability concern has no
business in a platform-free package. `apps/mobile` has no crawlable surface and gains nothing; the spec
records that no requirement here may force work in it.

The one boundary worth naming: `src/content.ts` is app-level content, not a design token and not domain
logic. It stays in `apps/web` because it is web copy, consumed by the build and by nothing else.

## Complexity Tracking

No constitution violations. Table retained per template with nothing to record.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _none_ | — | — |

## Post-Design Constitution Re-check

Re-evaluated after `data-model.md` and `contracts/page-identity.md` were written.

- **No new abstraction appeared during design.** The "page identity" in the data model is a description
  of tags in a document, not a runtime type or a new layer. `content.ts` is a plain module of exported
  strings — no factory, no registry, no configuration schema.
- **The design removed more than it added.** Runtime style injection (D2) and a mis-scoped `<h1>` (D4)
  both go away; `main.tsx` gets shorter.
- **One risk surfaced during design and was gated rather than accepted.** The precache manifest would
  sweep up build-emitted `robots.txt` and `sitemap.xml` automatically, caching crawler-facing files in
  every user's browser and letting a stale sitemap outlive its deployment (D9). The exclusion is by rule,
  not by filename, because that file's own comment already records what happens when the list is
  maintained by hand.
- **Verdict: PASS, unchanged.** Complexity Tracking stays empty.
