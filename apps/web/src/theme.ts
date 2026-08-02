import { color, type ThemedColor } from '@chromatic-tuner/tokens';
import type { TuningState } from '@chromatic-tuner/core';

/**
 * Emits every token as a CSS custom property in both appearances, so components
 * reference `var(--ct-*)` and never a literal (Principle IV, FR-018 — enforced
 * by the `no-restricted-syntax` lint rule on apps/**).
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

function block(theme: keyof ThemedColor): string {
  return Object.entries(color)
    .map(([name, value]) => `  --ct-${kebab(name)}: ${value[theme]};`)
    .join('\n');
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Both appearances are emitted: the media query follows the platform
 * preference by default (FR-019), and the `[data-theme]` selectors let a manual
 * override win in either direction.
 */
export const themeCss = `
:root {
${block('light')}
}

@media (prefers-color-scheme: dark) {
  :root {
${block('dark')}
  }
}

:root[data-theme='light'] {
${block('light')}
}

:root[data-theme='dark'] {
${block('dark')}
}
`;
