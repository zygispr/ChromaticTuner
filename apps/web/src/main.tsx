import { TunerProvider } from '@chromatic-tuner/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { WebAudioSource } from './adapters/web-audio-source';
import { TunerPage } from './components/pages/TunerPage';
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

// A single WakeLock no-op stands in until the real adapter lands in US3 (T072).
const wakeLock = {
  async acquire() {},
  async release() {},
};

createRoot(container).render(
  <StrictMode>
    <TunerProvider audioSource={new WebAudioSource()} wakeLock={wakeLock}>
      <TunerPage />
    </TunerProvider>
  </StrictMode>
);
