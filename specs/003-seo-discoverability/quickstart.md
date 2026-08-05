# Quickstart Validation: Search & Answer-Engine Discoverability

**Feature**: `003-seo-discoverability` · **Date**: 2026-08-04

Extends `001`'s **V1–V13** and `002`'s **V14–V21**, which all remain in force. New scenarios are
**V22–V29** and continue that numbering for the same reason the requirement numbers do — these are cited
from `tasks.md` and from code, and a reused number silently points at the wrong check.

Three of the eight are **web-only automated**, three are **human gates**, and two are **deployment
gates** that cannot run until the app has a public address. That split is honest rather than
unfortunate: link previews and public schema validators genuinely cannot be verified from a laptop with
no deployment, and a test that asserted something weaker while reporting green would be worse than
naming the limitation.

## Prerequisites

```bash
pnpm install                # corepack enable first; Node 20+
```

No new dependencies. The preview-image generator uses the Chromium that `@playwright/test` already
installs; if e2e has never been run in this checkout:

```bash
pnpm --filter @chromatic-tuner/web exec playwright install chromium
```

**Correction (Phase 2).** There is no `apps/web/.env`: `.gitignore` ignores `.env` and `.env.*` repo-wide
and permits only `.env.example`, which Vite does not read. The development default for `VITE_SITE_URL`
lives as a constant in `apps/web/vite.config.ts` instead, which a reviewer can see. Everything below still
runs on a clean checkout with no configuration.

## Running the suites

```bash
# Everything that gates a PR
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e

# This feature's specs, while working
pnpm --filter @chromatic-tuner/web exec playwright test e2e/metadata.spec.ts
pnpm --filter @chromatic-tuner/web exec playwright test e2e/no-script.spec.ts
pnpm --filter @chromatic-tuner/web exec playwright test e2e/fold.spec.ts

# Regenerate the preview image after a copy or token change
pnpm --filter @chromatic-tuner/web og:image

# Offline behaviour — cannot run under the dev server (no sw.js is emitted)
pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
```

---

## V22 — Content is served, not rendered (US1, FR-060–FR-064, P1–P4) · automated

Two halves, and both are needed.

```bash
pnpm --filter @chromatic-tuner/web exec playwright test e2e/no-script.spec.ts
pnpm build && grep -c "<h1" apps/web/dist/index.html    # the raw-bytes half
```

**Expected**: with `javaScriptEnabled: false`, the page shows the `<h1>`, the description, and every
content section. The built `index.html` contains them as literal bytes — exactly one `<h1>`, section
headings at `<h2>`, and ≥ 150 words of body text.

**Why both**: the Playwright half proves a browser displays it; the byte-level half proves it was
*served* rather than produced by something the harness permitted. P1's binding word is "before any
script executes", and only the second half actually tests that.

**Fails if**: the implementation reached for prerendering after all, and the content is generated into
the document by a build-time render of the React tree — that satisfies the letter of P1 but reintroduces
the hydration boundary D1 exists to avoid.

---

## V23 — The tuner still owns the fold (US1, FR-066, FR-067, P-none / SC-029, SC-032) · automated

```bash
pnpm --filter @chromatic-tuner/web exec playwright test e2e/fold.spec.ts
```

**Expected**: at the smallest supported viewport, every element of the tuning display and its controls
has a bounding box entirely within the first viewport height, with `scrollY === 0`. Reloading after
scrolling to the content returns to the top.

**Measure geometry, not structure.** An assertion that the content section follows `#root` in DOM order
passes on a build where the tuner is half off-screen. This repo has already shipped a defect of exactly
that shape — a marker 144px from where it belonged, past every `transform !== 'none'` assertion, for
seven phases. `e2e/helpers.ts` exists because of it; use the same bounding-box discipline here.

**Also assert the growth case (SC-032)**: temporarily add a paragraph large enough to encroach, confirm
the gate fails, and remove it. A gate never observed failing is not known to work.

---

## V24 — Page identity is complete and its assets resolve (US2, US4, FR-084, FR-085, P5–P8) · automated

```bash
pnpm --filter @chromatic-tuner/web exec playwright test e2e/metadata.spec.ts
```

**Expected**: every tag in contract §2 and §3 is present and non-empty; the canonical URL is absolute and
contains no unresolved `%` token; `og:image` returns `200` and is a 1200 × 630 PNG.

**Then demonstrate the gate fails (SC-031)**, for at least three items — remove the description, empty
the canonical, and rename `og-image.png`. Each must fail with a message naming the missing item, not a
generic assertion failure. Restore afterwards.

---

## V25 — Structured description validates and is corroborated (US3, FR-081–FR-083, P9–P11) · automated

Part of `metadata.spec.ts`.

**Expected**: exactly one JSON-LD block; it parses; `@type` is `SoftwareApplication`; `offers.price` is
`"0"`; every `featureList` entry is found in the rendered `document.body` text; no denylisted
out-of-scope term appears anywhere in the document.

**The corroboration check is the point.** Search the *rendered* text, not the source — a claim
"corroborated" by an HTML comment or an `aria-label` has not been corroborated for a consumer reading the
page.

---

## V26 — Offline still works and crawler files are not cached (US4, FR-086, P12a) · automated

```bash
pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
grep -o "robots\|sitemap" apps/web/dist/sw.js    # expect no matches
```

**Expected**: `verify:offline` passes unchanged. `robots.txt` and `sitemap.xml` exist in `dist/` and
appear **nowhere** in the generated precache manifest.

**Why this is a gate and not an assumption**: files emitted by a Vite plugin appear in Rollup's bundle
object, so the existing manifest derivation picks them up automatically unless excluded. The failure is
invisible online — every user's browser caching two crawler-facing files, and a `sitemap.xml` that
outlives its deployment.

---

## V27 — Appearance and accessibility of the new section (US1, FR-070, FR-071) · human + automated

```bash
pnpm --filter @chromatic-tuner/web exec playwright test e2e/appearance.spec.ts e2e/a11y.spec.ts
pnpm --filter @chromatic-tuner/web dev
```

**Automated**: Axe reports no violations on the content section; contrast meets AA in both appearances.

**Human legs** — the constitution requires a screenshot in both appearances for any UI change:

1. **Light and dark screenshots** of the fold and of the content section, attached to the PR.
2. **The scroll cue is visible and does not overlap any control** (FR-068). Check at the smallest
   supported width, where the tuner's controls sit closest to the bottom edge.
3. **Text-size preference**: raise the platform's text size to its largest setting and confirm the tuner
   still fits the fold. This is the setting most likely to break V23 in the field while passing it in CI.
4. **Keyboard traversal** (FR-071): tab from the tuner into the content and back out without traversing
   every element.

**Measure cold start** here too (SC-028, Principle V): before/after numbers against the 2 s budget. D2
removes a runtime step and the added bytes cost some; the net must be reported, not assumed.

---

## V28 — Public validators (US3, SC-025, SC-026) · manual release gate

Cannot run in CI: both are network calls to rate-limited third-party services, and a flaky gate is worse
than a scheduled check (research D8).

1. Google Rich Results Test and the Schema.org validator against the deployed URL — **zero errors**.
2. Lighthouse SEO audit against a production build — **no outstanding issues** in the SEO category.

Run at each release, alongside V13's thermal check.

---

## V29 — Real link previews and indexation (US2, US3, SC-024, SC-033) · deployment gate

**Blocked until the app has a public address.** Recorded here so it is not forgotten at deploy time
rather than omitted as untestable.

1. Paste the deployed URL into **at least three** widely used messaging or social platforms. Each must
   render a card with title, description, and image (SC-024).
2. Confirm the preview image is legible at the size each platform displays it (V-IMG-2 — a human check;
   1200 × 630 says nothing about whether the text inside it survives being shown at 300px wide).
3. Set `VITE_SITE_URL` for the deployment and confirm the built `robots.txt` **allows** crawling and the
   canonical tag names the real origin.
4. Deploy a preview build and confirm its `robots.txt` **disallows** everything (FR-076, P12) —
   **which requires leaving `VITE_SITE_URL` unset on that build.** ⚠️ This step said "with a different
   origin" and that was wrong: the implementation checks `siteOrigin !== DEVELOPMENT_ORIGIN`, so any
   origin other than localhost counts as canonical and gets an allow-all robots. The fail-safe protects
   the *forgotten* variable, not a *deliberately different* one. If the hosting platform injects a
   per-deployment URL automatically, turn that off for previews or they will compete with the live site.
   `verify:build-output` covers the unset case. Corrected 2026-08-05 at T057; the full reasoning is in the
   [deployment checklist](./tasks.md#deployment-checklist-t057).
5. Within 30 days, confirm the canonical address is indexed and no preview address is indexed alongside
   it (SC-033).

**Also at deploy time**: configure the host so unknown paths return `404`, not the SPA shell with a
`200`. Research D10 records why this is a hosting obligation rather than an application change — the app
has one real URL and no router — but it is a genuine soft-404 liability if the default fallback is left
in place.

---

## Coverage map

| Requirement | Where verified |
|---|---|
| FR-060–FR-064 | V22 |
| FR-065 | V25 (denylist), V27 (review) |
| FR-066, FR-067 | V23 |
| FR-068 | V27 (human) |
| FR-069 | V23, V27 (cold start) |
| FR-070, FR-071 | V27 |
| FR-072, FR-073 | V26, V29 |
| FR-074, FR-075 | V24, V29 |
| FR-076 | V29 |
| FR-077–FR-079 | V24 |
| FR-080 | V27 (human, installed-app identity) |
| FR-081–FR-083 | V25 |
| FR-084, FR-085 | V24 |
| FR-086 | V26 |
| FR-087 | V23 |
| SC-023 | V22 |
| SC-024 | V29 |
| SC-025, SC-026 | V28 |
| SC-027 | V25 |
| SC-028 | V27 |
| SC-029 | V23 |
| SC-030 | V27 (human) |
| SC-031, SC-032 | V23, V24 (gate-fails-when-broken) |
| SC-033 | V29 |
| SC-034 | full gate run |
