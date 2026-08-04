import { TunerProvider } from '@chromatic-tuner/react';
import { motion } from '@chromatic-tuner/tokens';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LocalStoragePreferences } from './adapters/local-storage-preferences';
import { WebAudioSource } from './adapters/web-audio-source';
import { WebWakeLock } from './adapters/web-wake-lock';
import { TunerPage } from './components/pages/TunerPage';
import { registerServiceWorker } from './register-sw';
import { themeCss } from './theme';

// Tokens are injected as CSS custom properties so components can reference
// var(--ct-*) and never a literal colour (Principle IV, FR-018).
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

  ${themeCss}
`;
document.head.appendChild(style);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    {/*
      autoStart is off because TunerGate decides when to open the microphone:
      immediately when permission is already held, or after the explainer when a
      browser prompt is still coming (FR-028).
    */}
    <TunerProvider
      audioSource={new WebAudioSource()}
      wakeLock={new WebWakeLock()}
      preferences={new LocalStoragePreferences()}
      autoStart={false}
    >
      <TunerPage />
    </TunerProvider>
  </StrictMode>
);

registerServiceWorker();
