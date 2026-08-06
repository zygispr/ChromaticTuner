/**
 * The one definition of the storage key (guarantee M8, research D4).
 *
 * It lived as a private constant in each adapter until 005, which was correct
 * while there were two: Principle I extracts on the third occurrence, not the
 * second. The third is the web's no-flash script, and it is the one that makes
 * the duplication dangerous rather than merely untidy — a copy of the string
 * inside a generated `<script>` body is outside the type checker's reach, so it
 * would drift silently and the only symptom would be a flash of the wrong
 * appearance in production builds.
 *
 * **This lives in a module of its own, and that is forced rather than tidy.**
 * `apps/web/vite.config.ts` is loaded by Node outside the app's module graph, so
 * it cannot import `@chromatic-tuner/core` — Node treats the bare specifier as
 * external and then rejects the extensionless imports inside the package. The
 * config therefore imports source files by relative path, and it can only do
 * that for a module that imports nothing itself. `preferences.ts` pulls in the
 * note math and two port types; this file pulls in nothing, exactly as
 * `packages/tokens/src/colors.ts` does for the same reason and with the same
 * comment beside it.
 *
 * Re-exported from `preferences.ts`, so every existing consumer is unaffected
 * and there is still only one definition.
 */
export const PREFERENCES_STORAGE_KEY = 'chromatic-tuner:preferences';
