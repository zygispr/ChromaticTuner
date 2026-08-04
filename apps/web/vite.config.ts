import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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
import { color, type ThemedColor } from '../../packages/tokens/src/colors.js';
import { space } from '../../packages/tokens/src/space.js';
import { type as typeScale } from '../../packages/tokens/src/type.js';
import { appName, description, heading, sections, title } from './src/content.js';

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

const themeCss = `
:root {
${themeBlock('light')}
}

@media (prefers-color-scheme: dark) {
  :root {
${themeBlock('dark')}
  }
}

:root[data-theme='light'] {
${themeBlock('light')}
}

:root[data-theme='dark'] {
${themeBlock('dark')}
}
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

/** Crawl directives (P12, FR-072, FR-073, FR-076). */
function robotsTxt(): string {
  return isCanonicalOrigin
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`
    : // Not the canonical origin, so this deployment must not compete with the
      // live site for the same queries. No hosting configuration involved.
      `User-agent: *\nDisallow: /\n`;
}

function sitemapXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${canonicalUrl}</loc>
  </url>
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
    transformIndexHtml() {
      // Tag descriptors only — never the `html` field. Returning `html` REPLACES
      // the whole document rather than adding to it, which silently deletes
      // `#root` and the module script along with everything else.
      return [
        {
          tag: 'style',
          attrs: { 'data-chromatic-tuner': 'tokens' },
          children: themeCss + contentCss,
          injectTo: 'head-prepend' as const,
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

      const manifest = [
        ...new Set(['/', '/index.html', '/manifest.webmanifest', '/icon.svg', ...assets]),
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
  },
});
