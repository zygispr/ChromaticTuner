import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type IndexHtmlTransformResult, type Plugin } from 'vite';

// Three deliberate choices in one import line, each forced by how Vite loads
// this file. None of them is stylistic, and reverting any one breaks the build.
//
// **Relative, not `@chromatic-tuner/tokens`.** Vite hands the config to Node,
// which treats a bare specifier as external and then rejects the extensionless
// imports inside the package — a module-not-found that fails the whole build.
//
// **The palette module, not the package barrel.** `src/index.ts` re-exports
// with extensionless specifiers, which Vite warns about on every build. That is
// the barrel's business and not worth changing a shared package over;
// `colors.ts` imports nothing, so naming it directly avoids the question.
//
// **`.js`, on a file that is `.ts`.** Vite's coming `configLoader: 'native'`
// requires an explicit extension, and TypeScript's `bundler` resolution maps
// `.js` to the `.ts` beside it. Writing `.ts` here instead satisfies Vite and
// fails typecheck with TS5097, which wants `allowImportingTsExtensions` — an
// option that conflicts with the `declaration: true` in tsconfig.base.json.
// `.js` is the one spelling both tools accept.
// Same three constraints as the token imports below, which is why this is a
// module that imports nothing: `preferences.ts` pulls in the note math and two
// port types, and Node would reject their extensionless specifiers here.
import { PREFERENCES_STORAGE_KEY } from '../../packages/core/src/preferences-key.js';
import { color, type ThemedColor } from '../../packages/tokens/src/colors.js';
import { space } from '../../packages/tokens/src/space.js';
import { type as typeScale } from '../../packages/tokens/src/type.js';
import {
  appName,
  description,
  features,
  heading,
  privacyDescription,
  privacyTitle,
  sections,
  title,
} from './src/content.js';

/**
 * The claims 004 authors once (`listing/store-listing.json`, FR-088).
 *
 * Read with `readFileSync` rather than imported: this file is loaded by Node
 * outside the app's module graph, `listing/` is outside the app entirely, and a
 * JSON import here would need an import attribute the config loader does not
 * apply uniformly. `listing/scripts/verify-listing.mjs` reads the same file the
 * same way.
 *
 * Only the microphone purpose sentence and the app name are used, and only by
 * the privacy page — which is the point of FR-105: the permission prompt, both
 * store listings, and the policy must explain the same purpose in the same
 * terms, so there is one sentence and four readers of it rather than four copies.
 */
const claims = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../listing/store-listing.json', import.meta.url)),
      'utf8'
    )
  ) as { claims: { appName: string; purposeSentence: string } }
).claims;

/**
 * The origin this build believes it is deployed to.
 *
 * Not a `.env` file: `.gitignore` ignores `.env` and `.env.*` repo-wide,
 * permitting only `.env.example`, which Vite does not read. Un-ignoring it was
 * rejected — that path is where secrets are expected to live, and a negation
 * rule there invites a key into the repository later. A public origin is not a
 * secret and belongs in reviewable source.
 *
 * The fallback is deliberately localhost rather than a plausible production
 * domain, and that choice is load-bearing (FR-076). A deploy that forgets to
 * set `VITE_SITE_URL` gets an origin that is **not** canonical, so the
 * disallow-all `robots.txt` below fires and the deployment is simply not
 * indexed. A realistic-looking placeholder would instead ship a confidently
 * wrong canonical address to production, which is the failure that is expensive
 * to notice.
 */
const DEVELOPMENT_ORIGIN = 'http://localhost:5173';

const siteOrigin = (process.env['VITE_SITE_URL'] ?? DEVELOPMENT_ORIGIN).replace(/\/+$/, '');

/** Only the configured canonical origin is offered for indexing (FR-076, P12). */
const isCanonicalOrigin = siteOrigin !== DEVELOPMENT_ORIGIN;

const canonicalUrl = `${siteOrigin}/`;

/** Minimal HTML escaping for copy interpolated into the document. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Every token as a CSS custom property, in both appearances.
 *
 * The single generator: `src/theme.ts` exposes `themedVar()` for components to
 * reference these by name, and this is the one place their values are written.
 * Keeping a second copy in the app's module graph would put the same palette in
 * two places with nothing to keep them in step, which is the drift Principle IV
 * exists to prevent.
 *
 * Both appearances are emitted: the media query follows the platform preference
 * by default (FR-019), and the `[data-theme]` selectors let a manual override
 * win in either direction.
 */
function themeBlock(theme: keyof ThemedColor): string {
  return Object.entries(color)
    .map(
      ([name, value]) =>
        `  --ct-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value[theme]};`
    )
    .join('\n');
}

/*
 * `color-scheme` accompanies every one of these blocks, and it is not
 * decoration (FR-118, added by 005).
 *
 * It governs the widgets the BROWSER draws rather than the ones this app does —
 * most visibly the settings sheet's `<input type="range">`, plus scrollbars and
 * default form colours. `index.html` declares `<meta name="color-scheme"
 * content="light dark">`, which was exactly right while the OS was the only
 * thing with an opinion: it tells the UA to follow `prefers-color-scheme`.
 *
 * An in-app override breaks that. `[data-theme='dark']` repaints everything
 * this app draws, and leaves the UA still following a light OS — so the slider
 * renders in light chrome on a dark sheet. Pinning `color-scheme` alongside the
 * override is what keeps the two in step, and it is CSS rather than JavaScript
 * so it lands with the same first paint as the tokens themselves.
 *
 * `:root` keeps `light dark` rather than a fixed value, which is the "Match
 * device" case: the UA is told both are available and picks for itself, exactly
 * as the meta tag intends. Pinning either one there would be the same mistake
 * as pinning `data-theme` for a `'system'` user.
 */
const themeCss = `
:root {
  color-scheme: light dark;
${themeBlock('light')}
}

@media (prefers-color-scheme: dark) {
  :root {
${themeBlock('dark')}
  }
}

:root[data-theme='light'] {
  color-scheme: light;
${themeBlock('light')}
}

:root[data-theme='dark'] {
  color-scheme: dark;
${themeBlock('dark')}
}
`;

/**
 * The no-flash script (M12, research D3, FR-120).
 *
 * The only synchronous route to a correct first paint on the web. Since `003`
 * the served document contains real content, so the browser paints **before**
 * the module graph executes — which means React cannot be the thing that sets
 * the appearance. Anything React does happens after a frame the user has
 * already seen, and for someone who chose Dark that frame is a white flash, in
 * exactly the conditions that made them choose Dark.
 *
 * Four properties, each of which is a way this can go wrong:
 *
 * - **Inline and blocking — specifically, not `type="module"`.** A module script
 *   is implicitly deferred, so it runs after the document is parsed, which is
 *   after first paint. It is also the likely mistake, being what one adds in
 *   order to write modern JavaScript in here. `defer` is NOT the hazard despite
 *   what M12's prose implies: the attribute is defined only for scripts with a
 *   `src`, so `<script defer>` around inline code does nothing at all. T038
 *   established that by trying both and watching only the module form fail.
 * - **Sets nothing for `'system'`.** The token stylesheet emits a
 *   `prefers-color-scheme` media query as well as the `[data-theme]` override,
 *   so leaving the attribute off is what keeps the media query in charge — a
 *   "Match device" user then follows the OS with no JavaScript at all. Writing
 *   the resolved value here would work and would quietly disable that.
 * - **Swallows everything.** Private browsing, a full quota, a hand-edited
 *   record, storage disabled entirely: every failure degrades to today's
 *   behaviour, never to the wrong appearance. The empty `catch` is the one
 *   place in this repo where silence is correct, so it says so.
 * - **The key is imported, never typed.** This string ends up inside generated
 *   HTML where no type checker can see it; M8 exists precisely so it cannot
 *   drift from the two adapters that read the same record.
 *
 * Written as ES5-compatible source on purpose. It runs before anything else on
 * the page, so it must not be the thing that fails on an old engine — and the
 * app's own bundle is free to target ES2022 because by then this has run.
 */
const noFlashScript = `
try {
  var raw = localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)});
  if (raw) {
    var appearance = JSON.parse(raw).appearance;
    if (appearance === 'light' || appearance === 'dark') {
      document.documentElement.setAttribute('data-theme', appearance);
    }
  }
} catch (e) {
  /* Intentionally empty: doing nothing leaves the media query in charge, which
     is the correct default. Reporting a failure here would mean touching the
     console before the app exists, for a condition the user cannot act on. */
}
`.trim();

/**
 * The layout reset, and the fold reserved for the tuner (FR-066, FR-069).
 *
 * These rules used to be appended to `<head>` by `main.tsx` during module
 * evaluation, which is the same mistake D2 already fixed for the token block —
 * caught later only because its symptom was subtler. `#root` is empty until
 * React mounts, so with the reset arriving alongside React the first painted
 * frame had a zero-height `#root` and the supporting content sitting 8px from
 * the top of the viewport: the heading and its prose flashed up and were then
 * replaced by the tuner. The page settled correctly, which is exactly why it
 * survived every test that waits for the app before looking.
 *
 * Reserving the space is the whole fix. The content is NOT hidden and must not
 * be — a consumer that runs no scripts has to receive it (FR-060, P1) — it is
 * simply below the fold from the first frame, where it ends up anyway.
 *
 * `min-height: 100dvh` states the same intent as `<main>` in `TunerLayout`, in
 * the same unit, so the reservation and the thing it reserves for cannot
 * disagree on mobile browsers whose chrome collapses on scroll.
 *
 * **`min-height` and NOT `height`, and the difference is a reported defect.**
 * `#root` used to carry both. `height: 100%` is a DEFINITE height, so `#root`
 * stayed pinned to the viewport while `<main>` grew to the 622px its column
 * needs — and the supporting content, positioned immediately after a box that
 * was 122px shorter than its own contents, was drawn UNDERNEATH the tuner:
 * the heading behind the readout, a paragraph behind the microphone control.
 * Reserving a floor is the requirement; capping the ceiling never was. The fold
 * now grows with the column, and everything below it moves down (`fold.spec.ts`,
 * `never paints over the supporting content`).
 *
 * `html, body` lose theirs with it. All a definite height on those was doing was
 * giving `#root`'s percentage something to resolve against — nothing else on
 * this page is sized as a percentage of the viewport's height, and `body`'s
 * background reaches the canvas by propagation rather than by covering it.
 *
 * Tuner document only. `privacy.html` runs no scripts, so nothing there ever
 * arrived late, and it has no `#root` to reserve anything for.
 */
const layoutCss = `
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; }
#root { min-height: 100dvh; }
`;

/**
 * Styling for the supporting content and the scroll cue.
 *
 * In the document rather than in the app's stylesheet, because the content it
 * styles is in the document: a consumer that runs no scripts must receive both
 * (FR-060). Colours are `var(--ct-*)` references, never literals, so this stays
 * inside Principle IV even though `index.html` is outside the lint rule's reach.
 *
 * `body` carries the background: `<main>` paints it today but only covers the
 * fold, so without this the area below the content renders on the browser's
 * default canvas — white, in dark mode.
 */
const contentCss = `
body {
  background: var(--ct-background);
  color: var(--ct-text);
}

/*
 * The cue sits in the last ${space.lg}px of the fold and the content begins
 * exactly at the viewport edge below it. The negative margin is what ties the
 * two together: the cue is always immediately above wherever the content
 * starts, with no second copy of the fold height to drift out of step (FR-068).
 *
 * ${space.lg}px and not more, because the fold has very little to spare. At the
 * smallest supported viewport (360×640) the tuner column measures 582px inside
 * 592px of available height — ten pixels of slack. A taller cue lands on the
 * microphone control, which FR-068 forbids and which the overlap assertion in
 * fold.spec.ts caught when this was first written at ${space.xl}px.
 */
#scroll-cue {
  height: ${space.lg}px;
  margin-top: -${space.lg}px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typeScale.labelSize}px;
  line-height: 1;
  color: var(--ct-no-reading);
  pointer-events: none;
}

#site-content {
  max-width: 62ch;
  margin: 0 auto;
  padding: ${space.xl}px ${space.md}px ${space.xl}px;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  font-size: ${typeScale.labelSize}px;
  line-height: 1.65;
}

#site-content h1 {
  font-size: ${typeScale.centsSize}px;
  font-weight: ${typeScale.weightBold};
  line-height: 1.2;
  margin: 0 0 ${space.md}px;
}

#site-content h2 {
  font-size: ${typeScale.labelSize}px;
  font-weight: ${typeScale.weightMedium};
  margin: ${space.lg}px 0 ${space.xs}px;
}

#site-content p {
  margin: 0;
}
`;

/**
 * The little the privacy page needs on top of the shared content styling (D9).
 *
 * Injected only into `privacy.html`. The tuner page's document is unchanged by
 * this feature, which FR-113 and SC-044 make a verified claim rather than an
 * intention — so this is a separate block rather than four more rules in
 * `contentCss`.
 *
 * `--ct-flat` for the link colour: it is the only blue in the palette and its
 * contrast against the background is asserted in both appearances by
 * `packages/tokens/tests/contrast.test.ts`. Chosen for that measurement, not for
 * its meaning on the tuner — a link is not a flat string, and the token names a
 * colour rather than a state here.
 */
const privacyCss = `
#site-content section {
  margin-top: ${space.lg}px;
}

#site-content p + p,
#site-content ul {
  margin-top: ${space.sm}px;
}

#site-content ul {
  padding-left: ${space.md}px;
}

#site-content li + li {
  margin-top: ${space.xs}px;
}

/*
 * Weight rather than size. The type scale has three sizes and the next one up
 * is the 32px cents readout, which is a display size — arithmetic on a token to
 * invent a fourth is how a scale stops being a scale.
 */
#site-content .lede {
  font-weight: ${typeScale.weightMedium};
}

#site-content .updated {
  margin-top: ${space.lg}px;
  color: var(--ct-no-reading);
}

#site-content a {
  color: var(--ct-flat);
}
`;

/**
 * The supporting content, as markup (FR-064, P2–P4).
 *
 * The single `<h1>` lives here rather than in a component, because a heading
 * owned by a component whose lifetime is shorter than the page's is the defect
 * D4 removed: the app's only `<h1>` used to unmount the moment microphone
 * permission was granted, leaving the steady-state page with none.
 *
 * The cue is `aria-hidden` and not focusable on purpose. `a11y.spec.ts` asserts
 * the first Tab lands on the reference control — "the only control on the tuner
 * screen" — so a focusable cue ahead of it in document order would break
 * keyboard expectations to no benefit; the content it points at is reachable in
 * document order regardless.
 */
const contentHtml = [
  `<h1>${escapeHtml(heading)}</h1>`,
  ...sections.map(
    (section) =>
      `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`
  ),
].join('\n');

/**
 * The machine-readable description of the app (D6, P9–P11, FR-081–FR-083).
 *
 * Every value comes from the same `content.ts` constants the visible markup and
 * the preview card use, which is the whole design: answer engines cross-check
 * schema claims against the page and discount the page where the two disagree,
 * so agreement here has to be structural rather than remembered. In particular
 * `featureList` is `content.features`, and each of those is authored as a
 * verbatim substring of a section body — the visible sentence is written first
 * and the claim derived from it, never the reverse.
 *
 * `SoftwareApplication` rather than `WebApplication`: the latter is a subtype
 * with no extra expressive power here and is the less widely consumed of the
 * two. The zero-price `offers` is the field most likely to be surfaced for the
 * queries this feature targets, and the one most likely to be left out because
 * "free" feels too obvious to state.
 *
 * `<` is escaped because this JSON is inlined into a `<script>` element, where a
 * literal `</script>` inside a string would close the block early. Nothing in
 * the current copy contains one; the escape means nothing ever can.
 */
function structuredDescription(): string {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: appName,
      description,
      url: canonicalUrl,
      applicationCategory: 'MultimediaApplication',
      // The conventional value for something that runs wherever a browser does.
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [...features],
      image: `${siteOrigin}/og-image.png`,
    },
    null,
    2
  ).replace(/</g, '\\u003c');
}

/** Crawl directives (P12, FR-072, FR-073, FR-076). */
function robotsTxt(): string {
  return isCanonicalOrigin
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`
    : // Not the canonical origin, so this deployment must not compete with the
      // live site for the same queries. No hosting configuration involved.
      `User-agent: *\nDisallow: /\n`;
}

/**
 * Every page this site actually has, in document order of importance.
 *
 * One list, read three times — by the sitemap, by the service worker's precache
 * array, and by the canonical link each page carries. 004 added the second page
 * and D9 names all three as registrations that ship quietly when missed: an
 * unlisted policy, a policy that breaks offline, and a policy claiming the
 * tuner's own address as its canonical.
 */
const PAGES = [
  { path: '/', file: 'index.html' },
  { path: '/privacy.html', file: 'privacy.html' },
] as const;

const pageUrl = (path: string): string => `${siteOrigin}${path}`;

function sitemapXml(): string {
  const entries = PAGES.map(({ path }) => `  <url>\n    <loc>${pageUrl(path)}</loc>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;
}

/**
 * The installed app's identity (FR-080).
 *
 * Generated rather than kept as a static file in `public/`, so `name` and
 * `description` are the same constants the page and the preview card use. The
 * previous static manifest restated the description in its own words, which is
 * exactly the drift this feature exists to remove — a person installing the app
 * and a person reading a shared link should not be told two different things.
 */
function webManifest(): string {
  return `${JSON.stringify(
    {
      name: appName,
      short_name: 'Tuner',
      description,
      lang: 'en',
      dir: 'ltr',
      // Both are in the standard registry, and they are the two a store-style
      // install surface would file a chromatic tuner under.
      categories: ['music', 'utilities'],
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: color.background.light,
      theme_color: color.background.light,
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    null,
    2
  )}\n`;
}

const PRIVACY_PAGE = 'privacy.html';

/**
 * The privacy page's build-time substitutions (D9, FR-105).
 *
 * The purpose sentence and the app name are authored in
 * `listing/store-listing.json` and read from there by `app.config.ts` (both iOS
 * purpose strings), by both store listings, and here. Writing them into
 * `privacy.html` as literal text would make this the fourth hand-maintained
 * copy of a sentence FR-105 requires to be identical everywhere — and the copy
 * nobody would think to update, because a policy page is edited once.
 *
 * A surviving placeholder throws rather than shipping. Vite leaves an unknown
 * `%TOKEN%` in place rather than blanking it, which is the same failure mode
 * `003` removed from the canonical link: a value-shaped string that every
 * "non-empty" check waves through.
 */
function privacyDocument(html: string): IndexHtmlTransformResult {
  const filled = Object.entries({
    '%CT_APP_NAME%': claims.appName,
    '%CT_PURPOSE_SENTENCE%': claims.purposeSentence,
  }).reduce((document, [token, value]) => document.replaceAll(token, escapeHtml(value)), html);

  const unresolved = [...new Set(filled.match(/%CT_[A-Z_]+%/g) ?? [])];
  if (unresolved.length > 0) {
    throw new Error(
      `privacy.html has unresolved placeholders: ${unresolved.join(', ')}. They are replaced from ` +
        'listing/store-listing.json in vite.config.ts; add the value there rather than typing it ' +
        'into the page (FR-105).'
    );
  }

  return {
    html: filled,
    tags: [
      {
        tag: 'style',
        attrs: { 'data-chromatic-tuner': 'tokens' },
        children: themeCss + contentCss + privacyCss,
        injectTo: 'head-prepend' as const,
      },
      // The policy page gets it too. It runs no React at all, so without this
      // it is the one surface that would ignore an in-app choice entirely and
      // keep following the device — and it is the page a store reviewer opens
      // (FR-118, "every surface").
      {
        tag: 'script',
        attrs: { 'data-chromatic-tuner': 'no-flash' },
        children: noFlashScript,
        injectTo: 'head' as const,
      },
      { tag: 'title', children: privacyTitle, injectTo: 'head' as const },
      {
        tag: 'meta',
        attrs: { name: 'description', content: privacyDescription },
        injectTo: 'head' as const,
      },
      {
        // Its own address, not the tuner's. The store privacy declaration's
        // `policyUrl` is derived from this origin plus the page's path, and
        // `pnpm verify:listing` compares the two — so a canonical pointing at
        // `/` would hand both stores an address for a page that is not this one.
        tag: 'link',
        attrs: { rel: 'canonical', href: pageUrl(`/${PRIVACY_PAGE}`) },
        injectTo: 'head' as const,
      },
    ],
  };
}

/**
 * Assembles everything the served document says about itself (research D1).
 *
 * The reflex fix for "a client-rendered app has no indexable content" is
 * prerendering. This app does not need it: the content that must be indexed was
 * never React's to render. The tuner is one interactive widget whose visible
 * state depends entirely on microphone permission and live audio; the
 * supporting content is immutable prose. So the prose goes in the document and
 * React keeps `#root` — no hydration boundary, no second render path, and no
 * new dependency.
 *
 * This plugin is where that assembly happens, and it is the point US1, US2 and
 * US3 all extend.
 */
function siteIdentity(): Plugin {
  return {
    name: 'chromatic-tuner-site-identity',

    /**
     * The design tokens, as a real stylesheet in the document (D2).
     *
     * These used to be built in `src/theme.ts` and appended to `<head>` by
     * `main.tsx` during module evaluation. Nothing noticed, because nothing
     * existed on the page until that same JavaScript ran. That stops being true
     * the moment static content sits in the document: a consumer with no
     * scripting renders it with no colours at all, and a real user watches it
     * paint unstyled and then re-paint when the style block lands — a flash and
     * a layout shift, which FR-069 forbids.
     *
     * Generated from `@chromatic-tuner/tokens` rather than hand-written,
     * because the lint rule that forbids literal colours only covers `.ts` and
     * `.tsx` under `apps/**`. A `<style>` block written by hand into
     * `index.html` would pass every gate while quietly duplicating the palette
     * with nothing to keep the copies in step (Principle IV).
     *
     * `head-prepend` so the tokens are defined before anything that reads them.
     */
    transformIndexHtml(html, ctx) {
      // 004 gave this site a second page, so the injection is now per-page.
      // Without the branch, `privacy.html` would receive the tuner's `<title>`,
      // the tuner's canonical address, and a second `<h1>` from the supporting
      // content — three defects that all look fine until a store reviewer opens
      // the policy link.
      if (ctx.path.endsWith(PRIVACY_PAGE)) return privacyDocument(html);

      // Tag descriptors only — never the `html` field. Returning `html` REPLACES
      // the whole document rather than adding to it, which silently deletes
      // `#root` and the module script along with everything else.
      return [
        {
          tag: 'style',
          attrs: { 'data-chromatic-tuner': 'tokens' },
          children: themeCss + layoutCss + contentCss,
          injectTo: 'head-prepend' as const,
        },
        // Synchronous and blocking, in <head>, so it runs before the document
        // body is parsed and therefore before the first paint (M12, D3).
        {
          tag: 'script',
          attrs: { 'data-chromatic-tuner': 'no-flash' },
          children: noFlashScript,
          injectTo: 'head' as const,
        },
        { tag: 'title', children: title, injectTo: 'head' as const },
        {
          tag: 'meta',
          attrs: { name: 'description', content: description },
          injectTo: 'head' as const,
        },
        {
          // Absolute and already resolved. 003 dropped Vite's `%VITE_SITE_URL%`
          // substitution here on purpose: an undefined token is left in place
          // rather than blanked, so a build with no origin configured would ship
          // a canonical whose value is the literal `%VITE_SITE_URL%` — a
          // URL-shaped string that every "non-empty" check waves through.
          tag: 'link',
          attrs: { rel: 'canonical', href: canonicalUrl },
          injectTo: 'head' as const,
        },
        /*
         * The preview identity (P6–P8, FR-077–FR-079).
         *
         * `og:title` and `og:description` read the same constants as the page's
         * own `<title>` and description, so the card cannot promise something
         * the page does not deliver — agreement is structural rather than
         * remembered.
         *
         * The image URL is absolute, built from the resolved origin. Several
         * preview generators do not resolve relative image URLs, and the
         * failure is silent: the card renders with text and no image, which
         * reads as a design choice rather than a bug.
         */
        {
          tag: 'meta',
          attrs: { property: 'og:title', content: title },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:description', content: description },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:site_name', content: appName },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:url', content: canonicalUrl },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${siteOrigin}/og-image.png` },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: heading },
          injectTo: 'head' as const,
        },
        // Twitter's card tags use `name`, not `property`. Mixing the two spells
        // a tag that looks correct in the source and is ignored by the consumer.
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
          injectTo: 'head' as const,
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: `${siteOrigin}/og-image.png` },
          injectTo: 'head' as const,
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: structuredDescription(),
          injectTo: 'head' as const,
        },
        // `body`, so both land after `#root` in document order: the tuner keeps
        // the fold and keyboard traversal reaches the content only after the
        // tuner's own controls (FR-066, FR-071).
        {
          tag: 'div',
          attrs: { id: 'scroll-cue', 'data-testid': 'scroll-cue', 'aria-hidden': 'true' },
          children: '▾',
          injectTo: 'body' as const,
        },
        {
          tag: 'div',
          attrs: { id: 'site-content', 'data-testid': 'site-content' },
          children: contentHtml,
          injectTo: 'body' as const,
        },
      ];
    },

    /**
     * Serve the crawl directives in development too.
     *
     * Not cosmetic: it means `metadata.spec.ts` can assert them over HTTP,
     * against the same document a crawler would request, instead of reading
     * `dist/` off disk and depending on a build having happened first.
     */
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/robots.txt') {
          response.setHeader('Content-Type', 'text/plain');
          response.end(robotsTxt());
          return;
        }
        if (request.url === '/sitemap.xml') {
          response.setHeader('Content-Type', 'application/xml');
          response.end(sitemapXml());
          return;
        }
        if (request.url === '/manifest.webmanifest') {
          response.setHeader('Content-Type', 'application/manifest+json');
          response.end(webManifest());
          return;
        }
        next();
      });
    },

    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: webManifest() });
    },
  };
}

/**
 * Emits `sw.js` with a precache list built from the bundle Vite actually
 * produced (FR-030, SC-011).
 *
 * A hand-written list of asset names rots the first time a chunk hash changes,
 * and the resulting bug — works online, broken offline — is one nobody
 * stumbles into during normal development. Deriving it from the bundle means it
 * cannot drift.
 */
function precache(): Plugin {
  return {
    name: 'chromatic-tuner-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        // Source maps are large and never needed to run the app offline.
        .filter((name) => !name.endsWith('.map'))
        /*
         * Empty chunks are deleted from the output after this hook runs, and
         * precaching one is fatal (found while adding privacy.html in 004).
         *
         * An HTML input with no `<script>` of its own still gets an entry chunk
         * from Rollup — `assets/privacy-BvRk9kiK.js`, zero bytes of code — and
         * Vite's own HTML plugin drops it later in the same build. It was
         * therefore listed in the precache manifest and never written to disk,
         * so `cache.addAll` rejected on install, so the service worker never
         * activated and the app was not offline-capable at all. One missing file
         * fails the whole `addAll`, and nothing about it is visible online: the
         * page works, and only a reload with the network off shows the damage.
         */
        .filter((name) => {
          const item = bundle[name];
          return item?.type !== 'chunk' || item.code.length > 0;
        })
        /*
         * Crawler-facing files are not part of the app (P12a).
         *
         * `siteIdentity()` emits robots.txt and sitemap.xml through `emitFile`,
         * which puts them in this very bundle object — so without this filter
         * they are swept into the precache automatically, and every user's
         * browser caches two files meant for crawlers. Worse, a cached
         * sitemap.xml outlives the deployment that produced it and keeps
         * answering with an address that may no longer be canonical.
         *
         * Stated as a rule over the emitted set rather than as the two
         * filenames, because that is what this manifest's whole design is
         * about: a hand-maintained list rots the moment something is added, and
         * the failure mode is invisible online. Any future directive or feed —
         * `ads.txt`, an RSS file — is excluded by the same rule without anyone
         * having to remember.
         */
        .filter((name) => !/\.(?:txt|xml)$/.test(name))
        .map((name) => `/${name}`);

      /*
       * The pages are listed explicitly, and `/privacy.html` is not redundant
       * with `assets` above.
       *
       * Vite's own HTML plugin emits the documents in its `generateBundle`, and
       * plugin hook order does not guarantee it has run before this one — so
       * `bundle` may not contain them yet. The tuner page has always been
       * listed here for that reason; the policy needs the same treatment, and
       * D9 names its absence as one of the three registrations that ship
       * quietly when missed. A policy is the one page a store reviewer is
       * certain to open, and "works online, blank offline" is precisely the
       * failure nobody stumbles into during development.
       */
      const manifest = [
        ...new Set([
          '/',
          ...PAGES.map(({ file }) => `/${file}`),
          '/manifest.webmanifest',
          '/icon.svg',
          ...assets,
        ]),
      ];

      // The cache name changes whenever the asset set does, which is what makes
      // `activate` evict the previous build rather than serving it forever.
      const version = createHash('sha256').update(manifest.join('|')).digest('hex').slice(0, 12);

      // replaceAll, not replace: the tokens are also named in the source file's
      // own doc comment, and replacing only the first occurrence substitutes
      // the comment while leaving the actual code referencing an undefined
      // identifier — a service worker that throws on install and an app that is
      // silently not offline-capable.
      const source = readFileSync(fileURLToPath(new URL('./sw-source.js', import.meta.url)), 'utf8')
        .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(manifest))
        .replaceAll('__CACHE_VERSION__', JSON.stringify(`chromatic-tuner-${version}`));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), siteIdentity(), precache()],
  server: {
    // Microphone access requires a secure origin; localhost qualifies.
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Both documents, or the second one is simply not built (D9). Vite's
      // default input is `index.html` alone, and an unbuilt page fails no
      // existing check — `dist/` would just quietly hold one fewer file than
      // the sitemap advertises.
      input: Object.fromEntries(
        PAGES.map(({ file }) => [
          file.replace(/\.html$/, ''),
          fileURLToPath(new URL(`./${file}`, import.meta.url)),
        ])
      ),
    },
  },
});
