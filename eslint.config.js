import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Boundary rules that enforce Constitution Principle VI (strict layering) and
// FR-018 (one visual language) are added in T027, once the packages they
// constrain actually contain source. This file is the base config only.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.min.js',
      '.specify/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2022 },
    },
    rules: {
      // Principle I: errors must never be silently swallowed.
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Principle I: dead code is deleted, not archived in place.
      'no-unreachable': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // Constitution Principle VI: strict layering, dependencies inward only.
  // packages/core is the pure domain and DSP layer. If it can import React or
  // touch the DOM, the "platform-agnostic core" claim decays the first time
  // someone is in a hurry — so it is a lint error, not a convention.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'packages/core MUST stay React-free (Principle VI).' },
            { name: 'react-dom', message: 'packages/core MUST stay React-free (Principle VI).' },
            {
              name: 'react-native',
              message: 'packages/core MUST stay platform-agnostic (Principle VI).',
            },
          ],
          patterns: [
            {
              group: ['react-native-*', '@react-native*', 'expo*'],
              message: 'packages/core MUST stay platform-agnostic (Principle VI).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'packages/core MUST NOT touch the DOM (Principle VI).' },
        { name: 'document', message: 'packages/core MUST NOT touch the DOM (Principle VI).' },
        { name: 'navigator', message: 'packages/core MUST NOT touch the DOM (Principle VI).' },
        { name: 'localStorage', message: 'Use the PreferencesStore port instead.' },
      ],
    },
  },

  // packages/react is the shared React layer: React is allowed, platform
  // primitives are not.
  {
    files: ['packages/react/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              message: '@chromatic-tuner/react is shared; platform primitives belong in apps/*.',
            },
            {
              name: 'react-dom',
              message: '@chromatic-tuner/react is shared; platform primitives belong in apps/*.',
            },
          ],
        },
      ],
    },
  },

  // Constitution Principle IV and FR-018: one visual language, one source of
  // truth. Hard-coded literals in an app are how two platforms silently drift
  // apart, so a raw colour value is an error.
  {
    files: ['apps/**/*.{ts,tsx}'],
    ignores: ['apps/**/e2e/**', 'apps/**/__tests__/**', 'apps/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Hard-coded colour. Import it from @chromatic-tuner/tokens (Principle IV, FR-018).',
        },
        {
          selector: 'Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]',
          message:
            'Hard-coded colour. Import it from @chromatic-tuner/tokens (Principle IV, FR-018).',
        },
      ],
    },
  },

  // Node-context config and tooling files. These are CommonJS by necessity —
  // Metro, Babel, and Jest all load their config through require().
  {
    files: [
      '**/*.config.{js,ts,mjs,cjs}',
      '**/jest.setup.js',
      'apps/mobile/index.js',
      'apps/web/e2e/fixtures/*.mjs',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Verification scripts are Node programs that drive a browser, so the bodies
  // of their page.evaluate() callbacks are browser code living inside a Node
  // file. Both sets of globals are legitimately in scope.
  //
  // listing/scripts/ is the same kind of program for 004's release artefacts:
  // the icon generator rasterises through the installed Chromium exactly as
  // apps/web/scripts/generate-og-image.mjs does (research D6), and the listing
  // gate is plain Node. They live outside apps/ because three of their inputs
  // and outputs are not mobile-only — see 004's plan, "Structure Decision".
  {
    files: ['apps/web/scripts/*.mjs', 'listing/scripts/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // The service worker runs in a ServiceWorkerGlobalScope, not a window, and
  // the two build-time placeholders are substituted by the `precache` plugin in
  // apps/web/vite.config.ts before the file is ever executed.
  {
    files: ['apps/web/sw-source.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __CACHE_VERSION__: 'readonly',
        __PRECACHE_MANIFEST__: 'readonly',
      },
    },
  },

  // Jest globals for the mobile test setup. ESLint 10 removed /* eslint-env */,
  // so the globals have to be declared here.
  {
    files: ['apps/mobile/jest.setup.js', 'apps/mobile/__tests__/**/*.{ts,tsx,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },

  prettier
);
