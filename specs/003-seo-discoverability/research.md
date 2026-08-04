# Phase 0 Research: Search & Answer-Engine Discoverability

**Feature**: `003-seo-discoverability` · **Date**: 2026-08-04

Ten decisions. The first one collapses most of the feature's apparent complexity; the rest follow from it
or from constraints already in the tree that a naive implementation would trip over.

---

## D1 — Static content in `index.html`, outside `#root`. No prerendering.

**Decision**: The supporting content, the `<h1>`, and every metadata tag are written directly into
`apps/web/index.html` as static markup. React continues to own `#root` and nothing else. There is no
server-side rendering, no build-time prerender step, no hydration, and no new framework.

**Rationale**: The reflex answer to "a client-rendered SPA has no indexable content" is to reach for
prerendering — render the React tree to HTML at build time and hydrate it in the browser. That reflex is
wrong here, and it is worth being explicit about why, because every guide found in the survey recommends
it.

Prerendering exists to solve a problem this app does not have: *content that lives inside the component
tree*. Here the content does not. The tuner is one interactive widget whose entire visible state depends
on microphone permission and live audio — none of which a build step can produce, and none of which
should be indexed. The supporting content is immutable prose that will change a few times a year and
never depends on component state. The two have no overlap.

So the useful framing is not "how do we render React to HTML" but "which parts of this page were ever
React's job". The answer is: the tuner, and nothing else. Put the prose in the document, mount the widget
into a sibling element, and the problem is gone — with no hydration boundary, no mismatch class of bug,
no second render path to keep in sync, and no new dependency.

This also happens to be the only option that satisfies FR-060 *honestly*. Prerendering this app would
capture the pre-permission state — the explainer screen — which is what a crawler would see anyway.
Serving that as the page's indexable content would mean the page's substance is a permission request.

Principle II makes this more than a preference: a prerender pipeline is an abstraction layer with one
implementation, and a server-rendering framework for one static page is exactly the "framework-within-
the-framework" the principle names.

**Alternatives considered**:

- *Build-time prerender via `react-dom/server` + hydration* — rejected. Adds a second render path, a
  hydration-mismatch failure mode, and a build step, to produce markup for content React had no reason to
  own. Also captures the permission-prompt state, per above.
- *A static-site framework (Astro, Next.js) for the shell* — rejected outright. Replaces a 40-line Vite
  config with a framework, for one page, against Principle II.
- *Third-party dynamic-rendering service (serve prerendered HTML to bots)* — rejected. Adds a paid
  external dependency, serves different content to crawlers than to users, and the survey lists "serving
  pre-rendered HTML to real users" and "incomplete bot user-agent lists" as its two most common failure
  modes. Also unnecessary once D1 holds.

---

## D2 — The theme CSS moves from runtime injection to a build-time `<style>` in `<head>`.

**Decision**: `themeCss` (today built in `apps/web/src/theme.ts` and injected into `document.head` by
`main.tsx`) is emitted into `index.html` at build time by a small `transformIndexHtml` plugin in
`vite.config.ts`, alongside the existing `precache` plugin. `main.tsx` stops injecting it.

**Rationale**: This is the finding that D1 forces and that would otherwise ship as a defect.

Every colour, spacing and type value in the web app reaches the DOM as a `var(--ct-*)` custom property,
and the block that *defines* those properties is built by JavaScript and appended to `<head>` during
module evaluation. Today that is invisible, because nothing exists on the page until the same JavaScript
runs. The moment static content sits in the document, it does not:

- With scripting disabled — the crawler case FR-060 exists for — the below-fold content renders with no
  colours at all. Black-on-white default styling, no theme, and no dark-mode response.
- With scripting enabled, the content paints before `main.tsx` evaluates and then re-paints when the
  style block lands. That is a flash of unstyled content and a layout shift, which FR-069 forbids and
  SC-029 measures.

Moving the emission to build time fixes both, and is strictly better even ignoring this feature: it
removes a runtime step from the cold-start path (Principle V) and eliminates a latent FOUC that exists
today on a slow connection.

It also sidesteps a constraint collision cleanly. The ESLint rule forbidding literal colours is scoped to
`apps/**/*.{ts,tsx}`, so it does not lint `index.html` — meaning a hand-written `<style>` block with hex
values in the HTML would pass every gate while violating Principle IV's single-source-of-truth rule in
spirit. Generating the block from `@chromatic-tuner/tokens` at build time means there is no literal to
write.

**Alternatives considered**:

- *Leave injection in `main.tsx`, accept unstyled content for crawlers* — rejected. Crawlers now assess
  rendered appearance, and FR-069's no-layout-shift requirement is broken for real users regardless.
- *A hand-written `<style>` block in `index.html`* — rejected. Duplicates the token values with no
  mechanism to keep them in sync; the drift would be silent and Principle IV is explicit.
- *A separate `.css` file imported by `main.tsx`* — rejected. Still arrives via the JS graph, so it does
  not help the no-script case; and it would have to duplicate the tokens as literals.

---

## D3 — The page scrolls; `#root` keeps exactly one viewport height.

**Decision**: `html, body { height: 100% }` becomes `min-height: 100%`, `#root`'s `height: 100%` is
dropped, `TunerLayout`'s `overflow: hidden` is removed, and the layout's `minHeight: 100dvh` is what
guarantees the tuner owns the fold. `history.scrollRestoration = 'manual'` is set so a return visit lands
on the tuner (FR-067).

**Rationale**: Three rules in `main.tsx` and `TunerLayout.tsx` currently conspire to make the document
unscrollable — `height: 100%` on the chain and `overflow: hidden` on `<main>`. Content placed after
`#root` would be present in the DOM, readable by a crawler, and completely unreachable by a person. The
change is small but it is the one that must be made deliberately rather than discovered.

`100dvh` (already used) rather than `100vh` matters more once the page scrolls: on mobile browsers whose
chrome collapses on scroll, `100vh` overstates the viewport and pushes part of the tuner below the fold
at rest — the exact FR-066 violation the fold gate exists to catch.

Scroll restoration is the non-obvious half. Browsers restore scroll position on reload and on back
navigation by default. A player who read the content, then returned the next day, would land on prose
with the tuner off-screen — and the app's whole premise is that the readout is visible at a glance.

**Alternatives considered**:

- *`scroll-snap` to the two sections* — rejected. Fights the user on small screens where the content
  section is taller than a viewport, and adds motion the reduced-motion preference would have to undo.
- *Keep `overflow: hidden` and put content in a nested scroller* — rejected. Nested scroll containers are
  a known accessibility and keyboard-navigation hazard, and search engines treat content in an
  overflow-hidden subtree with suspicion.

---

## D4 — The `<h1>` moves out of `PermissionPrompt` and into the static document.

**Decision**: `index.html` carries the page's single `<h1>`. `PermissionPrompt.tsx`'s current `<h1>`
("Tune by ear-free listening") becomes a `<p>` styled identically, or an `<h2>` if it should remain in the
outline.

**Rationale**: FR-063 requires exactly one top-level heading. Today the only `<h1>` in the app is inside
`PermissionPrompt`, which means the page has one heading before permission is granted and *zero*
afterwards — the element unmounts. Adding a static `<h1>` without touching the component would give the
pre-permission page two.

Beyond the count, the current heading is wrong for the job. "Tune by ear-free listening" is a clever line
that names no searchable concept; as the page's `<h1>` it tells a search engine nothing. Its actual role
is the explainer screen's title, which is a sub-heading of the page, not the page's subject.

**Alternatives considered**:

- *Keep the component `<h1>` and make the static one an `<h2>`* — rejected. Makes the page's own subject
  subordinate to a transient permission screen, and leaves the page with no `<h1>` in its steady state.

---

## D5 — Canonical origin comes from a Vite HTML env substitution, with a local default.

**Decision**: `index.html` references `%VITE_SITE_URL%` in its canonical, `og:url`, and `og:image` tags.
The value is supplied by `VITE_SITE_URL` in the build environment. `apps/web/.env` commits a development
default so builds and tests work with no configuration; deployment supplies the real origin.
`robots.txt`'s sitemap line and `sitemap.xml`'s `<loc>` are generated from the same value by the build.

**Rationale**: FR-075 requires the address to be configuration, not source, and Vite already replaces
`%VITE_*%` tokens in `index.html` natively — no plugin, no dependency, no template step. The spec's
Dependencies section commits to "supplying the address later is a configuration change, not a code
change", and this is what makes that literally true.

Committing a default matters more than it looks, and Vite's documented behaviour is what makes it
necessary rather than merely tidy: **an undefined variable is left in place, not replaced.** A missing
`VITE_SITE_URL` therefore ships a canonical tag whose literal value is `%VITE_SITE_URL%` — not an empty
tag that an assertion would obviously catch, but a syntactically valid URL-shaped string. Contract P5's
"contains no `%` token" clause exists specifically for this, and the committed default means a clean
checkout cannot reach it.

(Verified against Vite's `env-and-mode` documentation: "If the env doesn't exist in `import.meta.env`,
e.g. `%NON_EXISTENT%`, it will be ignored and not replaced.")

`robots.txt` and `sitemap.xml` cannot use the HTML substitution — Vite only processes `index.html` — so
they are emitted by the same build plugin that already runs, from the same environment variable. One
source, three consumers.

**Alternatives considered**:

- *Hard-code a placeholder domain and swap it later* — rejected; it is the exact code-change-at-deploy
  the spec forbids, and placeholders of this kind reliably ship to production.
- *Inject the canonical tag at runtime from JS* — rejected. Defeats the purpose: a consumer that does not
  run scripts is precisely who the canonical tag is for.

---

## D6 — Structured data as a single inline JSON-LD `SoftwareApplication`, generated from one source.

**Decision**: One `<script type="application/ld+json">` block in `index.html` describing the app as a
`SoftwareApplication` with `applicationCategory`, `operatingSystem`, a zero-price `offers`, and a
`featureList`. Its field values and the page's visible copy are generated from a single module so they
cannot disagree.

**Rationale**: `SoftwareApplication` is the schema type that matches what this is, and the free-price
`offers` entry is the field most likely to be surfaced — "free" is the qualifier in nearly every query
this feature targets.

The generated-from-one-source part is the substantive decision, and it exists to make FR-083 structurally
true rather than merely tested. The survey's clearest 2026 finding was that answer engines now validate
schema claims against visible page text and discount the page when they disagree. A test that checks
agreement catches drift after it is written; deriving both from one module means the drift cannot be
expressed. The test still gets written — Principle III is not optional — but it then guards a property
the design already enforces, which is the right relationship.

Concretely: a `content.ts` module in `apps/web` exports the copy strings, the build plugin renders both
the visible markup and the JSON-LD from it, and the e2e test asserts every `featureList` entry appears in
the rendered page's text.

**Alternatives considered**:

- *`WebApplication`* — rejected; it is a subtype of `SoftwareApplication` with no additional expressive
  power here, and `SoftwareApplication` is the more widely consumed of the two.
- *Adding `FAQPage`* — rejected for now. Rich FAQ results were substantially deprecated for
  non-authoritative sites, so it buys little, and it constrains the content's shape to a Q&A format that
  the "how to use this tuner" copy does not naturally take.
- *`AggregateRating` / review markup* — rejected. There are no ratings. Inventing them is exactly the
  unverifiable claim D6 exists to prevent.
- *An `llms.txt` file* — rejected. The survey found no correlation between its presence and LLM citation
  across 300k domains, no major AI lab committed to honouring it, and log analysis showing most AI
  crawlers never request it. It is a file to maintain for no measured benefit; Principle II says no.

---

## D7 — The preview image is generated by the Playwright already in the tree, and committed.

**Decision**: `apps/web/scripts/generate-og-image.mjs` renders an HTML template at 1200×630 using the
existing `@playwright/test` Chromium and screenshots it to `apps/web/public/og-image.png`, which is
committed. A gate asserts the committed file exists and matches its source.

**Rationale**: Every platform in FR-078's scope wants a raster image at roughly 1200×630; SVG is not
reliably rendered as a preview by any of them, and the repo currently ships only SVG. Something has to
rasterise.

The repo already has the answer installed. Playwright is a devDependency, it is already in CI, and it
renders HTML at an exact device size and screenshots it — which is all this needs. Adding `sharp` or a
resvg binding to do the same thing would be a new dependency, with a native build, for a task the
existing toolchain already performs. Principle II's dependency test rejects it.

Committing the output rather than generating it during `pnpm build` follows the precedent already set by
`e2e/fixtures/generate.mjs`, which generates WAV fixtures that are likewise committed: a generator script
plus a checked-in artefact, regenerated deliberately. It keeps `pnpm build` free of a browser launch, and
it means the image is reviewable in a pull request.

Building the template from the token palette means the preview card matches the app's actual appearance
and needs no literal colours.

**Alternatives considered**:

- *Hand-author a PNG in a design tool and commit it* — rejected. Drifts from the palette with nothing to
  detect it, and cannot be regenerated when a token changes.
- *`sharp` / `@resvg/resvg-js` as a devDependency* — rejected per the dependency rule above.
- *Generate during `pnpm build`* — rejected. Puts a browser launch in the critical build path for an
  asset that changes about once a year.

---

## D8 — Verification is Playwright, in three new specs; the public validators stay manual.

**Decision**: Three new e2e specs — `metadata.spec.ts` (page identity, FR-084/FR-085), `no-script.spec.ts`
(served content with `javaScriptEnabled: false`, FR-060), and `fold.spec.ts` (FR-066/FR-087 at the
smallest supported viewport). Structured-data validation against Google's and Schema.org's public
validators, and real link-preview rendering on live platforms, are **manual release gates** in the
`quickstart.md` V-series, like V13.

**Rationale**: `apps/web` has no Vitest project — the root config's `projects` is `packages/*` only — so
Playwright is where a web-app assertion can live at all. It is already in CI, and its `webServer` runs
`pnpm dev`, which serves `index.html` with the substitutions applied, so all of this is testable without
a production build.

`javaScriptEnabled: false` is a first-class Playwright context option, which makes FR-060 — the
requirement that looks hardest to test — a three-line `test.use`. This is worth stating plainly because
it is the assertion most likely to be skipped as "not really testable".

The fold gate reuses the bounding-box measurement discipline `e2e/helpers.ts` already established for the
marker. That helper exists because an assertion phrased as "a transform was applied" passed for seven
phases while the marker sat 144px from where it belonged. The same trap is available here: asserting that
the content section exists and is `below` in DOM order proves nothing about whether the tuner still fits
in a viewport. The gate measures real boxes against the real viewport height.

The two things that stay manual are the two that genuinely cannot be automated honestly. Google's Rich
Results Test is a network call to a rate-limited third-party service; putting it in CI buys a flaky gate.
Link previews cannot be verified except by pasting a public URL into a real platform, which requires a
deployment that does not yet exist. Declaring these manual is more honest than a test that asserts
something weaker and reports green.

**Alternatives considered**:

- *A Lighthouse CI SEO gate* — rejected for now. Its SEO category largely restates assertions the three
  specs make directly, and it adds a heavyweight dependency plus score flakiness. Lighthouse remains the
  manual audit instrument behind SC-026.
- *Adding a Vitest project for `apps/web` to unit-test the generated HTML* — rejected. It would test the
  generator's output string rather than the served document, which is the weaker of the two assertions,
  and Playwright already covers the stronger one.

---

## D9 — `robots.txt` and `sitemap.xml` are build-emitted and deliberately not precached.

**Decision**: Both are emitted by the build plugin (D5) rather than committed to `public/`, and neither
is added to the service worker's precache manifest. Non-production builds emit a `robots.txt` that
disallows everything (FR-076).

**Rationale**: The precache manifest in `vite.config.ts` is derived from the emitted bundle plus three
hard-coded entries. Files in `public/` do not appear in Rollup's bundle object, so anything placed there
is *already* excluded — but files emitted by a plugin via `this.emitFile` **do** appear, and would be
swept into the precache list automatically. That is the trap: crawler-facing files would be cached in
every user's browser for no benefit, and — worse — a stale cached `sitemap.xml` would outlive the
deployment that produced it.

The manifest filter therefore has to exclude them explicitly. This is a real change to a file whose
comment already warns that hand-maintaining the list rots; the exclusion must be by rule, not by name.

Crawlers do not execute service workers, so nothing about the offline design affects what a crawler
receives — but the app's own offline guarantee (FR-030, FR-086) must survive the change, and
`verify:offline` is the check that proves it.

The environment-conditional `robots.txt` is what satisfies FR-076 without any hosting-level
configuration. A preview deployment builds with a different `VITE_SITE_URL`, gets a
disallow-everything `robots.txt`, and cannot compete with the canonical origin.

**Alternatives considered**:

- *Commit static files to `public/`* — rejected for `sitemap.xml` and `robots.txt` alike, because both
  need the configured origin (D5) and `robots.txt` needs to vary by environment.
- *Rely on a hosting provider's preview-deployment `noindex` header* — rejected. Ties a correctness
  property to a hosting feature the repo does not choose or control, and there is no deployment yet.

---

## D10 — Soft 404s are recorded as a deployment obligation, not solved in the app.

**Decision**: The service worker serves the cached `index.html` for *any* in-scope navigation, and any
static host will be configured with the same SPA fallback. This means `/anything` returns HTTP 200 with
the tuner page. That is a soft-404 pattern, and it is recorded in `quickstart.md` as a deployment
checklist item rather than worked around in code.

**Rationale**: It is a genuine SEO liability — a crawler that discovers a bad link gets a 200 and an
indexable page instead of a 404, which wastes crawl budget and can put junk URLs in the index. It is also
not something this codebase can fix: it is determined by hosting configuration that does not exist yet,
and the app has exactly one real URL, so `sitemap.xml` listing that one address (FR-073) plus the
canonical tag on it (FR-074) already gives crawlers the correct picture.

Recording it explicitly is the point. It is the kind of issue that is invisible until traffic exists and
then expensive to diagnose, and the alternative — inventing a routing layer for a single-page app to
produce 404s for URLs nobody links to — would fail Principle II badly.

**Alternatives considered**:

- *Add client-side routing that renders a 404 view for unknown paths* — rejected. Still HTTP 200, so it
  does not fix the actual problem, and it adds a router to an app with one page.

---

## Summary of what this feature adds and changes

**New files**: `apps/web/src/content.ts`, `apps/web/scripts/generate-og-image.mjs`,
`apps/web/public/og-image.png`, `apps/web/.env`, three e2e specs.

**Changed files**: `apps/web/index.html` (static content, metadata, JSON-LD), `apps/web/vite.config.ts`
(theme injection, robots/sitemap emission, precache exclusion), `apps/web/src/main.tsx` (stop injecting
theme, height rules, scroll restoration), `apps/web/src/theme.ts` (export for build-time use),
`apps/web/src/components/templates/TunerLayout.tsx` (drop `overflow: hidden`),
`apps/web/src/components/molecules/PermissionPrompt.tsx` (demote `<h1>`),
`apps/web/public/manifest.webmanifest` (FR-080 completeness).

**New dependencies**: none.

**Untouched**: `packages/core`, `packages/react`, `packages/tokens` (consumed, not modified), and all of
`apps/mobile`.
