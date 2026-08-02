import { space } from '@chromatic-tuner/tokens';
import type { ReactNode } from 'react';

import { themedVar } from '../../theme';

export interface TunerLayoutProps {
  readonly children: ReactNode;
}

/**
 * Full-viewport, centred, no scrolling.
 *
 * FR-018 requires the primary display to be fully visible without scrolling,
 * tapping, or expanding on the smallest supported screen — the player's hands
 * are on the instrument.
 */
export function TunerLayout({ children }: TunerLayoutProps) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${space.lg}px ${space.md}px`,
        background: themedVar('background'),
        color: themedVar('text'),
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </main>
  );
}
