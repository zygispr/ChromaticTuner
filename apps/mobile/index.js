import { loadPreferences } from '@chromatic-tuner/core';
import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import App, { preferences } from './src/App';

/**
 * Preferences are read BEFORE the root component mounts (M12, research D5).
 *
 * This is the mobile half of FR-120, and the reason it is here rather than in a
 * hook: the native launch screen stays on screen until the first React Native
 * view renders, so delaying the mount by one AsyncStorage read means the first
 * frame the user ever sees is already the right appearance. A provider that
 * started from the defaults and corrected itself in an effect would render one
 * frame of the wrong appearance first — which for the user who chose Dark is a
 * white flash, in the conditions that made them choose Dark.
 *
 * The read is a single key against a 2-second cold-start budget, but it is on
 * the startup path, so it is measured rather than assumed:
 * `scripts/measure-cold-start.sh`, compared against the baseline in
 * `specs/005-dark-mode-toggle/tasks.md` (SC-049).
 *
 * `loadPreferences` never rejects — it is total by construction (obligation P1)
 * and falls back to the defaults for absent, corrupt, or unreadable data — so
 * there is no failure path here that could leave the app unregistered. `catch`
 * is present anyway, because "never rejects" has to mean never: an app that
 * fails to start is a far worse outcome than an app that starts in the default
 * appearance.
 *
 * JSX is deliberately avoided: this file is plain `.js` and outside the Babel
 * JSX transform's usual reach for entry points, so `createElement` is the
 * spelling that does not depend on that.
 */
function register(initialPreferences) {
  registerRootComponent(() => createElement(App, { initialPreferences }));
}

loadPreferences(preferences).then(register, () => register(undefined));
