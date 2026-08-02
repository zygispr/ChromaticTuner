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

  // Node-context config and tooling files. These are CommonJS by necessity —
  // Metro, Babel, and Jest all load their config through require().
  {
    files: ['**/*.config.{js,ts,mjs,cjs}', '**/jest.setup.js', 'apps/mobile/index.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
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
