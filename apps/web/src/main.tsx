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
