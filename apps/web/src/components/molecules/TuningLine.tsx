import {
  DISPLAY_RANGE_CENTS,
  IN_TUNE_TOLERANCE_CENTS,
  type TuningState,
} from '@chromatic-tuner/core';
import { motion, space } from '@chromatic-tuner/tokens';
import { useEffect, useRef } from 'react';

import { stateColorVar, themedVar } from '../../theme';
import { TickMark } from '../atoms/TickMark';

export interface TuningLineProps {
  readonly state: TuningState;
  readonly subscribeToCents: (handler: (cents: number) => void) => () => void;
}

const TICKS = [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50];
const MAJOR_TICKS = [-50, 0, 50];

/**
 * The product's signature element: one horizontal line, flat left, sharp right.
 *
 * The marker is positioned by writing `transform` directly to the DOM node from
 * the continuous cents subscription. It deliberately does NOT go through React
 * state — at ~43 updates a second that would re-render this subtree 43 times a
 * second and break the 60 fps budget (Principle V, research D6, guarantee R1).
 */
export function TuningLine({ state, subscribeToCents }: TuningLineProps) {
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    // FR-016: respect the platform's reduced-motion preference by dropping the
    // transition entirely rather than merely shortening it.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    marker.style.transition = reduceMotion
      ? 'none'
      : `transform ${motion.markerMs}ms ${motion.easing}`;

    return subscribeToCents((cents) => {
      const clamped = Math.max(-DISPLAY_RANGE_CENTS, Math.min(DISPLAY_RANGE_CENTS, cents));
      const percent = (clamped / DISPLAY_RANGE_CENTS) * 50;
      marker.style.transform = `translateX(-50%) translateX(${percent * 2}%)`;
    });
  }, [subscribeToCents]);

  const inTuneWidthPercent = (IN_TUNE_TOLERANCE_CENTS / DISPLAY_RANGE_CENTS) * 100;

  return (
    <div
      data-testid="tuning-line"
      // The marker's position is the same information the announcer speaks,
      // and it moves ~43 times a second. Announcing it too would be noise.
      aria-hidden="true"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 720,
        height: 96,
        margin: '0 auto',
      }}
    >
      {/* The in-tune zone, drawn so the target is visible (FR-008). */}
      <div
        data-testid="in-tune-zone"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${inTuneWidthPercent}%`,
          height: 40,
          transform: 'translate(-50%, -50%)',
          borderRadius: 6,
          background: stateColorVar['in-tune'],
          opacity: state === 'in-tune' ? 0.28 : 0.12,
          transition: `opacity ${motion.colorMs}ms ${motion.easing}`,
        }}
      />

      {/* The line itself. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 2,
          transform: 'translateY(-50%)',
          background: themedVar('line'),
          opacity: 0.6,
        }}
      />

      {TICKS.map((cents) => (
        <TickMark key={cents} cents={cents} />
      ))}
      {MAJOR_TICKS.map((cents) => (
        <TickMark key={`major-${cents}`} cents={cents} major />
      ))}

      {/* The marker. Position is written imperatively; only its colour is React. */}
      <div
        ref={markerRef}
        data-testid="tuning-marker"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 6,
          height: 72,
          marginTop: -36,
          borderRadius: 3,
          background: stateColorVar[state],
          transform: 'translateX(-50%)',
          willChange: 'transform',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          padding: `0 ${space.xs}px`,
          color: themedVar('text'),
          // 0.7, not the 0.55 this started at: Axe measured the composited
          // result at 3.9:1 against the background, under the 4.5:1 AA floor
          // for 12px text. The token was correct and the opacity defeated it —
          // which the tokens package's own contrast test cannot see, because it
          // checks the palette rather than what lands on the page.
          // These words are one of FR-015's redundant channels, so "decorative"
          // is not an available excuse for them being hard to read.
          opacity: 0.7,
          fontSize: 12,
          letterSpacing: '0.1em',
        }}
      >
        <span>FLAT</span>
        <span>SHARP</span>
      </div>
    </div>
  );
}
