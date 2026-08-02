import { TunerProvider } from '@chromatic-tuner/react';
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
