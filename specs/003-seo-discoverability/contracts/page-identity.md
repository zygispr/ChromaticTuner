# Page Identity Contract: Search & Answer-Engine Discoverability

**Feature**: `003-seo-discoverability` · **Date**: 2026-08-04

This feature changes **no** core API. `contracts/core-api.md` and `contracts/platform-ports.md` from
`001` are untouched, `packages/core/testing/port-contract-tests.ts` gains no obligations, and `002`'s
`core-api-delta.md` is unaffected.

What it does define is a contract of a different kind: **what the built document must expose to a
consumer that does not run our code.** Search crawlers, link-preview generators, and answer-engine
fetchers are now consumers of `apps/web`, and their interface is the served HTML. The guarantees below
are numbered **P1–P12** and are cited by number from code comments and `tasks.md`, in the same way `S`,
`A`, `N`, and `R` guarantees are.

Every guarantee here is verifiable against the served document. That is deliberate: a "contract" no test
can address is a wish.

---

## §1 Served content

> **P1.** The response to a `GET` of the canonical URL contains the page's title, description, single
> `<h1>`, and the full text of every content section, **before any script executes**.

The binding word is *before*. This is FR-060, and it is what makes every other guarantee reachable by
consumers that do not execute JavaScript — which is most of them.

Verified by `no-script.spec.ts` with `javaScriptEnabled: false`, which asserts against the rendered
document, and by a scriptless fetch that asserts against the raw bytes. Both matter: the first proves a
browser shows it, the second proves it was *served* rather than produced by a script the harness allowed.

> **P2.** The document contains **exactly one** `<h1>`.

Not "at least one". The pre-permission screen currently carries the app's only `<h1>` and unmounts it on
grant, so the naive change produces two headings before permission and one after. Both counts are wrong.

> **P3.** Content sections use `<h2>`; no heading level is skipped.

> **P4.** The total visible word count of the content sections is **≥ 150** (SC-023).

A floor, not a target. Its purpose is to fail when the content is quietly emptied, not to encourage
padding.

---

## §2 Document identity

> **P5.** The document exposes, with values agreeing across every place each appears:
>
> | Tag | Constraint |
> |---|---|
> | `<title>` | non-empty, ≤ 60 characters |
> | `<meta name="description">` | non-empty, 120–155 characters |
> | `<link rel="canonical">` | absolute URL, resolved — contains no `%` token |
> | `<html lang>` | present |

Agreement is *structural*: `og:title` and `<title>` read the same constant from `content.ts`, so they
cannot diverge (data-model V-COPY-3). The gate asserts the outcome anyway, because the structure could
be undone by a later edit and the assertion is cheap.

The "resolved" clause on the canonical URL is the one that catches the realistic failure: a build with no
`VITE_SITE_URL` emits the literal `%VITE_SITE_URL%` and every downstream consumer records a broken
address. A committed development default (research D5) makes this unreachable on a clean checkout, and
P5 makes it unreachable in CI regardless.

---

## §3 Preview identity

> **P6.** The document exposes `og:title`, `og:description`, `og:image`, `og:url`, `og:type`,
> `og:site_name`, `twitter:card`, and `twitter:image`.

> **P7.** `og:image` and `twitter:image` resolve to an **absolute** URL that returns `200` and is a PNG
> of 1200 × 630.

Absolute, not root-relative: several preview generators do not resolve relative image URLs, and the
failure is silent — a card renders with text and no image, which looks like a design choice rather than a
bug.

Verified by `metadata.spec.ts` requesting the URL and asserting the status and the intrinsic dimensions
(FR-085). This is the guarantee that catches a moved or renamed asset.

> **P8.** `og:title` equals `<title>`; `og:description` equals the meta description.

---

## §4 Structured description

> **P9.** The document contains exactly one `<script type="application/ld+json">` whose content parses as
> JSON and declares `@type: "SoftwareApplication"` with, at minimum: `name`, `description`,
> `applicationCategory`, `operatingSystem`, `url`, and an `offers` object with `price: "0"` and a
> `priceCurrency`.

> **P10.** Every string in the structured description's `featureList` appears in the document's visible
> text.

**P10 is the load-bearing one.** It is FR-083, and it exists because answer engines now cross-check
schema claims against the page and discount pages where they disagree. A `featureList` entry claiming
something no visible sentence supports is worse than omitting it.

The test extracts `featureList` from the parsed JSON-LD and searches the rendered `document.body`
`innerText` for each entry — the rendered text, not the source, so a claim "corroborated" only by a
comment or an attribute does not pass.

> **P11.** No string anywhere in the document — copy, structured description, or preview identity — names
> a capability listed as out of scope in `001`.

Asserted against a denylist: tuning presets, Drop D, DADGAD, custom tunings, per-string targets,
reference tone, capo, transposition, metronome, chord library, sign-in, account, sync. This is a crude
check and it is meant to be; the failure it guards against is someone reaching for a phrase that ranks
well, and crude is sufficient to stop that.

---

## §5 Crawl direction

> **P12.** The build emits `/robots.txt` and `/sitemap.xml`. `robots.txt` names the sitemap's absolute
> URL. `sitemap.xml` lists the canonical URL and no other. When the build's configured origin is not the
> canonical one, `robots.txt` disallows all crawling.

And the negative half, which is the part that would otherwise be discovered by accident:

> **P12a.** Neither file appears in the service worker's precache manifest.

Files emitted by a Vite plugin **do** appear in Rollup's bundle object, so `vite.config.ts`'s existing
manifest-derivation would sweep them in automatically. The result would be crawler-facing files cached in
every user's browser, and a `sitemap.xml` that outlives the deployment that produced it. The exclusion
must be expressed as a rule over the emitted set, not a list of two filenames — that file's own comment
already records what happens when the list is maintained by hand.

---

## What is explicitly **not** in this contract

- **No HTTP header guarantees.** Caching, compression, and security headers are hosting configuration;
  there is no deployment yet, and the repo cannot assert what it does not serve.
- **No status-code guarantee for unknown paths.** The SPA fallback returns `200` for any in-scope
  navigation, which is a soft-404 pattern. Research D10 records it as a deployment obligation rather than
  inventing a router for a one-page app.
- **No `llms.txt`.** Rejected in D6 on measured-benefit grounds.
- **No ranking or indexation guarantee.** SC-033 observes indexation after deployment; nothing in a
  codebase can contract for it.
