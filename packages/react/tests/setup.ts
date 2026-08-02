import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-registers cleanup when a global `afterEach` exists,
// which it does not here — we run Vitest without `globals: true` so that test
// imports stay explicit. Without this, mounted trees leak between tests and
// queries start matching elements from earlier cases.
afterEach(() => {
  cleanup();
});
