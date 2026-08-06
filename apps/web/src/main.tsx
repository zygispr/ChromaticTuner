import { TunerProvider, usePreferences } from '@chromatic-tuner/react';
import { motion } from '@chromatic-tuner/tokens';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { LocalStoragePreferences } from './adapters/local-storage-preferences';
import { WebAudioSource } from './adapters/web-audio-source';
import { WebWakeLock } from './adapters/web-wake-lock';
import { TunerPage } from './components/pages/TunerPage';
import { registerServiceWorker } from './register-sw';
import { useDeviceAppearance } from './useDeviceAppearance';

/**
 * A return visit starts at the tuner, never where the reader left off (FR-067).
 *
 * Browsers restore scroll position on reload and on back-navigation by default.
 * Now that supporting content sits below the fold, that default would land
 * someone who read it yesterday on prose with the tuner off-screen — against an
 * app whose entire premise is a readout legible at a glance.
 *
 * Set here rather than in the document because it is behaviour, and because
 * `history` is not addressable from static markup.
 */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

/**
 * Layout rules only.
 *
 * The `--ct-*` token block used to be built here and appended to `<head>` at
 * runtime. It now ships in the document itself, emitted at build time by
 * `siteIdentity()` in vite.config.ts — see that plugin for why (D2). Components
 * still reference `var(--ct-*)` and never a literal colour (Principle IV,
 * FR-018); only the moment of definition moved, from module evaluation to the
 * served bytes.
 */
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; height: 100%; }
  body { -webkit-font-smoothing: antialiased; }

  /*
   * Visible focus, as Principle IV requires of every interactive element.
   * The controls here set their own background and border, which in several
   * browsers suppresses or camouflages the default focus ring — so the ring is
   * stated explicitly, in the theme's text colour, with an offset that keeps it
   * legible against both the light and dark background.
   *
   * :focus-visible rather than :focus, so a pointer user does not get a ring
   * they did not ask for while a keyboard user always does.
   */
  :focus-visible {
    outline: 3px solid var(--ct-text);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /*
   * FR-058 / FR-059: every control reacts to the pointer.
   *
   * Raised by V20's human leg — the tester found the reference control unaided
   * but noted that nothing in the app responds to hover, which makes a
   * correctly-labelled control still feel dead.
   *
   * An inset box-shadow rather than a background, because the app has two
   * button shapes and this rule has to serve both: ghost controls that are
   * transparent, and solid ones filled with --ct-text. Setting a background
   * would erase the solid fill and take its --ct-background-coloured label with
   * it. An inset shadow paints above the background and below the content, so
   * it washes over whatever is already there. One rule on the element type also
   * means a new control cannot forget to opt in.
   *
   * Split in two on purpose. Hover is gated on a device that HAS hover: without
   * the guard, tapping a control on a phone leaves the wash stuck to it until
   * something else is tapped, which reads as a jammed button. :active is
   * ungated, so a touch user gets press feedback at all and a mouse user gets
   * it on press as well as on hover.
   *
   * Never the only affordance: every control already carries a border or a fill
   * at rest (FR-052), because a control that only appears under a pointer is
   * invisible to every touch user.
   */
  button {
    transition: box-shadow ${motion.colorMs}ms ${motion.easing};
  }

  @media (hover: hover) {
    button:hover {
      box-shadow: inset 0 0 0 100vmax var(--ct-pressed);
    }
  }

  button:active {
    box-shadow: inset 0 0 0 100vmax var(--ct-pressed);
  }

  /*
   * FR-016: honour the platform's reduced-motion preference globally, not just
   * in the marker. A transition the user has asked not to see is not a detail
   * to apply selectively.
   */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
document.head.appendChild(style);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

/**
 * Keeps `data-theme` on `<html>` in step with the stored choice (FR-118).
 *
 * Renders nothing; it exists because the attribute lives outside React's tree
 * and something inside the provider has to own it.
 *
 * **Gated on `preferencesLoaded` (M10), and that gate is the whole point.** The
 * provider's first render carries `DEFAULT_PREFERENCES`, so writing on mount
 * would stamp `system`'s answer over whatever the inline no-flash script had
 * correctly established a moment earlier — reintroducing the exact flash that
 * script exists to prevent.
 *
 * **Keyed off the PREFERENCE, not the resolved appearance.** For `'system'` the
 * attribute is removed rather than set to the resolved value: `packages/tokens`
 * emits both a `prefers-color-scheme` media query and a `[data-theme]` override,
 * and leaving the override off is what keeps the media query in charge — so a
 * user who has chosen "Match device" follows the OS with no JavaScript involved
 * at all. Writing the resolved value here would work, right up until it did not.
 */
function ThemeSync() {
  const { appearancePreference, preferencesLoaded } = usePreferences();

  useEffect(() => {
    if (!preferencesLoaded) return;

    const root = document.documentElement;
    if (appearancePreference === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = appearancePreference;
    }
  }, [appearancePreference, preferencesLoaded]);

  return null;
}

/**
 * The app root, which exists so the device appearance can be read with a hook.
 *
 * `useDeviceAppearance` subscribes to the media query, so it has to run inside a
 * component rather than at module scope where the tree used to be built.
 */
function Root() {
  const deviceAppearance = useDeviceAppearance();

  return (
    /*
      autoStart is off because TunerGate decides when to open the microphone:
      immediately when permission is already held, or after the explainer when a
      browser prompt is still coming (FR-028).
    */
    <TunerProvider
      audioSource={audioSource}
      wakeLock={wakeLock}
      preferences={preferences}
      deviceAppearance={deviceAppearance}
      autoStart={false}
    >
      <ThemeSync />
      <TunerPage />
    </TunerProvider>
  );
}

/**
 * Constructed once, at module scope, not per render.
 *
 * `TunerProvider` builds a new session whenever the port identities change, so
 * constructing these inside `Root` would tear down and rebuild the audio graph
 * on every device-appearance change — which is precisely the "re-asks for the
 * microphone" failure `appearance.spec.ts` guards against.
 */
const audioSource = new WebAudioSource();
const wakeLock = new WebWakeLock();
const preferences = new LocalStoragePreferences();

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

registerServiceWorker();
