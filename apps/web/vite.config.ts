import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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
  plugins: [react(), precache()],
  server: {
    // Microphone access requires a secure origin; localhost qualifies.
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
