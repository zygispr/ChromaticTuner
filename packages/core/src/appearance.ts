import type { Appearance, AppearancePreference } from './types';

/**
 * Turn a stored preference and the device's own setting into the one appearance
 * to render (guarantees M1-M4, data-model §3).
 *
 * Total, pure, and the only place the rule exists. It lives in `packages/core`
 * rather than beside either platform's theming precisely because both platforms
 * must answer this question identically (FR-124) — and because it can: it reads
 * nothing outside its arguments, so the ES2022-only, DOM-free constraint on this
 * package is satisfied without effort.
 *
 * The two halves are easy to state and easy to half-implement:
 *
 * - FR-116 — an explicit `'light'` or `'dark'` outranks the device. An
 *   implementation that returns `deviceAppearance` unconditionally satisfies
 *   every `'system'` case and is still wrong for the case the user cared enough
 *   to change.
 * - FR-115 — `'system'` defers to the device, live. Resolving it once and
 *   storing the answer would break the moment the OS changed.
 *
 * The return type is `Appearance`, never `AppearancePreference` (M4):
 * `'system'` is storable and choosable, but it is not paintable.
 */
export function resolveAppearance(
  preference: AppearancePreference,
  deviceAppearance: Appearance
): Appearance {
  return preference === 'system' ? deviceAppearance : preference;
}
