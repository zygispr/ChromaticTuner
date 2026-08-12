import {
  DIAL_SEGMENT_DEGREES,
  dialAngleDegrees,
  noteName,
  unwrapDegrees,
  type AccidentalStyle,
  type TuningState,
} from '@chromatic-tuner/core';
import { motion, type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useRef, useState } from 'react';

import { stateColorVar, themedVar } from '../../theme';

export interface TuningDialProps {
  readonly state: TuningState;
  readonly accidentalStyle: AccidentalStyle;
  /** Pitch class of the note being named, or null when nothing is being read. */
  readonly activePitchClass: number | null;
  readonly subscribeToReading: (
    handler: (cents: number | null, clarity: number, midi: number | null) => void
  ) => () => void;
}

const SEGMENTS = 12;

/**
 * Capped, not fixed. The dial is fluid below this so it fits a narrow phone,
 * and capped above it so a desktop does not draw a metre-wide speedometer.
 */
const MAX_SIZE_PX = 320;

/** Where the labels sit, as a percentage of the dial's half-width. */
const LABEL_RADIUS_PERCENT = 38;

/** The needle spans from the centre out to here, in percent of the dial. */
const NEEDLE_TOP_PERCENT = 18;

/**
 * The circular display: twelve segments, C at the top, clockwise is sharper.
 *
 * A sibling of `TuningLine`, not a variant of it (research D1). The two share a
 * props shape and nothing else — one translates along an axis and the other
 * rotates about a centre — so a common "meter" abstraction would have exactly
 * two implementations sharing only their prop names.
 *
 * THE ROTATION GOES ON THE WRAPPER, NEVER ON THE NEEDLE. `rotate()` turns an
 * element about its own centre, and a needle drawn from the dial's centre to
 * its rim has its centre halfway along itself — so rotating the needle directly
 * makes it orbit its own midpoint and swing out of the circle, while
 * `getComputedStyle` reports exactly the matrix that was asked for. This is the
 * rotate-shaped twin of the `translateX` percentage bug that shipped for seven
 * phases (see TuningLine), and it is defeated the same way: the transform goes
 * on a dial-sized, concentric element for which the geometry means what it
 * appears to mean (research D5, guarantee G21). `e2e/helpers.ts:needleAngleDeg`
 * measures real bounding boxes to keep this honest.
 *
 * The needle's angle is written to the DOM directly from the continuous
 * channel, never through React state — at ~43 updates a second that would
 * re-render this subtree 43 times a second (Principle V, guarantee R1).
 *
 * Note what this display does NOT do: it does not draw an in-tune zone. At
 * 0.3 degrees per cent the in-tune band is 3 degrees wide — an arc of about
 * seven pixels — so the tolerance is carried by colour, as it already is, and
 * the TARGET is carried by the labels and the active segment's centre tick
 * (research D6, D7).
 */
export function TuningDial({
  state,
  accidentalStyle,
  activePitchClass,
  subscribeToReading,
}: TuningDialProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  /**
   * The accumulated, unwrapped angle. A ref rather than state because it is
   * written ~43 times a second, and it must persist across renders: folding it
   * back into [0, 360) is precisely what makes the needle spin a full turn
   * backwards at the top of the dial (data-model §5, guarantee G11).
   */
  const angleRef = useRef(0);

  /**
   * FR-163: nothing is drawn until something has been heard. "No angle yet" is
   * a different state from "an angle of zero" — a needle parked straight up
   * before the first pluck reads as "C detected".
   */
  const [hasReading, setHasReading] = useState(false);
  // Guards the one setState this component is allowed to make from the
  // continuous channel. It fires once per session, on the first reading, and
  // the ref is what stops it firing 43 times a second thereafter.
  const announcedReading = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (wrapper) {
      // FR-165: drop the transition entirely under reduced motion rather than
      // merely shortening it, exactly as TuningLine does.
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      wrapper.style.transition = reduceMotion
        ? 'none'
        : `transform ${motion.markerMs}ms ${motion.easing}`;
    }

    return subscribeToReading((cents, _clarity, midi) => {
      // A lapse holds the needle where it is (FR-162). The colour changes,
      // because `state` becomes 'no-reading' on the discrete channel, but the
      // angle is deliberately left alone: returning to rest is the LINE's
      // behaviour, and the dial's rest position would name a note.
      if (cents === null || midi === null) return;

      if (!announcedReading.current) {
        announcedReading.current = true;
        setHasReading(true);
      }

      // The wrapper does not exist until the render that follows the line
      // above, so the first reading of a session writes nothing. One frame.
      if (!wrapperRef.current) return;

      const next = unwrapDegrees(angleRef.current, dialAngleDegrees(midi, cents));
      angleRef.current = next;
      wrapperRef.current.style.transform = `rotate(${next}deg)`;
    });
  }, [subscribeToReading, hasReading]);

  const segments = Array.from({ length: SEGMENTS }, (_, pitchClass) => pitchClass);

  return (
    <div
      data-testid="tuning-dial"
      // The needle's position is the same information the announcer speaks, and
      // it moves ~43 times a second. Announcing it too would be noise (G24).
      aria-hidden="true"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: MAX_SIZE_PX,
        aspectRatio: '1 / 1',
        margin: '0 auto',
      }}
    >
      {/* The rim. */}
      <div
        data-testid="dial-rim"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          // NO opacity multiplier, here or anywhere below. A dimmed token is
          // invisible to the palette test and to Axe alike, and has defeated
          // the 3:1 floor twice in this repo (G22).
          border: `2px solid ${themedVar('line')}`,
        }}
      />

      {/* Boundary ticks, halfway between adjacent segment centres. */}
      {segments.map((pitchClass) => (
        <div
          key={`tick-${pitchClass}`}
          data-testid="dial-tick"
          style={{
            position: 'absolute',
            inset: 0,
            // Same wrapper idiom as the needle: rotate a dial-sized element, so
            // the tick's own centre is never the pivot.
            transform: `rotate(${DIAL_SEGMENT_DEGREES / 2 + pitchClass * DIAL_SEGMENT_DEGREES}deg)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: 2,
              height: 10,
              marginLeft: -1,
              background: themedVar('line'),
            }}
          />
        </div>
      ))}

      {/* The target mark on the segment the needle is in. */}
      {activePitchClass !== null && (
        <div
          data-testid="dial-target"
          style={{
            position: 'absolute',
            inset: 0,
            transform: `rotate(${activePitchClass * DIAL_SEGMENT_DEGREES}deg)`,
            transition: `transform ${motion.markerMs}ms ${motion.easing}`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 2,
              width: 3,
              height: 14,
              marginLeft: -1.5,
              background: stateColorVar[state],
            }}
          />
        </div>
      )}

      {/* Twelve labels, upright wherever they sit, at their segment's centre. */}
      {segments.map((pitchClass) => {
        const angle = (pitchClass * DIAL_SEGMENT_DEGREES * Math.PI) / 180;
        const left = 50 + LABEL_RADIUS_PERCENT * Math.sin(angle);
        const top = 50 - LABEL_RADIUS_PERCENT * Math.cos(angle);
        const active = activePitchClass === pitchClass;

        return (
          <span
            key={`label-${pitchClass}`}
            data-testid="dial-label"
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: typeTokens.labelSize,
              // Weight as well as colour, so the active segment survives
              // greyscale (FR-015, SC-070).
              fontWeight: active ? typeTokens.weightBold : typeTokens.weightRegular,
              color: active ? stateColorVar[state] : themedVar('text'),
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* The ONE place accidental style is applied, reused rather than
                reimplemented — which is what makes FR-156 structural. */}
            {noteName(pitchClass, accidentalStyle)}
          </span>
        );
      })}

      {/*
        The needle. The WRAPPER is dial-sized and concentric, and it is what
        rotates; the needle inside it is never transformed. See the note at the
        top of this file — this is the single most breakable thing here.
      */}
      {hasReading && (
        <div
          ref={wrapperRef}
          data-testid="dial-needle-wrapper"
          style={{ position: 'absolute', inset: 0, willChange: 'transform' }}
        >
          <div
            data-testid="dial-needle"
            style={{
              position: 'absolute',
              left: '50%',
              top: `${NEEDLE_TOP_PERCENT}%`,
              // Down to the dial's centre, so the needle reads as radiating
              // from the middle rather than as a floating bar.
              height: `${50 - NEEDLE_TOP_PERCENT}%`,
              width: 6,
              marginLeft: -3,
              borderRadius: 3,
              background: stateColorVar[state],
            }}
          />
        </div>
      )}
    </div>
  );
}
