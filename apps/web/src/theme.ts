import type { TuningState } from '@chromatic-tuner/core';

/**
 * References a token by name, so components use `var(--ct-*)` and never a
 * literal (Principle IV, FR-018 — enforced by the `no-restricted-syntax` lint
 * rule on apps/**).
 *
 * The properties themselves are defined in the served document, generated from
 * the palette at build time by `siteIdentity()` in vite.config.ts. They used to
 * be built here and appended to `<head>` by `main.tsx` during module
 * evaluation, which was invisible while nothing on the page could paint before
 * that script ran — and stops being invisible the moment static content sits in
 * the document (research D2).
 *
 * The generator moved rather than being duplicated: this module no longer
 * imports the palette at all, so there is exactly one place the token values
 * are written.
 */
export function themedVar(name: string): string {
  return `var(--ct-${name})`;
}

export const stateColorVar: Record<TuningState, string> = {
  flat: themedVar('flat'),
  sharp: themedVar('sharp'),
  'in-tune': themedVar('in-tune'),
  'no-reading': themedVar('no-reading'),
};
