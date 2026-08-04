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
      return [
        {
          tag: 'style',
          attrs: { 'data-chromatic-tuner': 'tokens' },
          children: themeCss,
          injectTo: 'head-prepend' as const,
        },
      ];
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
