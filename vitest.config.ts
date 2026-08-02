import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config.
 *
 * Note: `vitest.workspace.ts` (named in task T010) was removed in Vitest 4.
 * The current equivalent is `test.projects` here — same behaviour, one file.
 *
 * The >=90% line threshold is scoped to packages/core only, per Constitution
 * Principle III: UI shells and platform glue are exempt from the numeric
 * target. apps/mobile runs under jest-expo and is excluded entirely.
 */
export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
