import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Phase 1 placeholder. TunerProvider wiring with the web adapters lands in
// T049; the component tree lands in T046-T049.
function App() {
  return <main>ChromaticTuner</main>;
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
