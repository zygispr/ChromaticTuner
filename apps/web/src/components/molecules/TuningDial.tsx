import {
  DIAL_SEGMENT_DEGREES,
  dialAngleDegrees,
  noteName,
  unwrapDegrees,
  type AccidentalStyle,
  type TuningState,
} from '@chromatic-tuner/core';
import { motion, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { stateColorVar, themedVar } from '../../theme';

export interface TuningDialProps {
  readonly state: TuningState;
  readonly accidentalStyle: AccidentalStyle;
  /** Pitch class of the note being named, or null when nothing is being read. */
  readonly activePitchClass: number | null;
  readonly subscribeToReading: (
    handler: (cents: number | null, clarity: number, midi: number | null) => void
  ) => () => void;
  /**
   * The note name and the cents readout, drawn in the centre of the circle
   * (FR-168). Passed in already built rather than assembled here, so the dial
   * stays a drawing and `TunerDisplay` keeps deciding what the screen contains.
   */
  readonly hub?: ReactNode;
}

const SEGMENTS = 12;

/**
 * How large the note name is as a fraction of the dial's width (FR-169).
 *
 * Arithmetic, not taste. The hub is a CIRCLE, so what has to fit is the text
 * block's half-diagonal against the hub's radius, not its width against the
 * diameter — the needle sweeps every angle, so a block that clears the hub's
 * left and right edges can still have its corners outside it. Measuring the
 * rendered block at "C♯4" gives roughly 1.6 x the note size wide and 1.4 tall,
 * whose half-diagonal is ~1.06 x the note size; against a hub of 0.55R = 0.275
 * of the width, that allows 0.259. This is rounded down to leave the margin
 * that font metrics differing between platforms will spend.
 *
 * There is deliberately NO lower bound. A floor would guarantee the text
 * overflows the hub at some small dial, which is exactly the collision `G26`
 * exists to prevent; a dial too small to read is a smaller problem than a note
 * name lying across the needle, and FR-018's fit cases bound it from the other
 * side anyway.
 */
const NOTE_SIZE_RATIO = 0.24;

/**
 * Capped, not fixed. The dial is fluid below this so it fits a narrow phone,
 * and capped above it so a desktop does not draw a metre-wide speedometer.
 *
 * DERIVED, not chosen: it is the smallest dial whose hub holds the note name at
 * the full `type.noteSize`, so moving the note inside the circle can never make
 * the largest element on the screen smaller than the horizontal display already
 * draws it (FR-169, G26). Change the ratio and the cap follows.
 */
const MAX_SIZE_PX = Math.round(typeTokens.noteSize / NOTE_SIZE_RATIO);

/**
 * Everything in the tuner column that is NOT the dial, plus the layout's own
 * vertical padding: reference badge, direction cue, the status slot, the
 * microphone control, and their gaps.
 *
 * Measured, not guessed. This exists because the dial is the FIRST element in
 * this app whose height competes with the viewport. It sized itself from width
 * alone at first, and that shipped a defect: the column went 574px to 798px, and
 * below an 846px viewport the microphone control was pushed off the bottom of
 * the screen — 122px off it at 700px — against FR-018, which requires the
 * primary display to be usable without scrolling because the player's hands are
 * on the instrument.
 *
 * It was 526 while the note name and the cents readout sat above the dial. They
 * are now inside it (FR-168), which returns their 128px and 32px and the two
 * `space.lg` gaps that separated them — 208px, and the whole reason the circle
 * could grow (FR-170).
 *
 * If a row above or below the dial changes height, this number is wrong and the
 * `fits the viewport` cases in `e2e/dial.spec.ts` are what say so.
 */
const COLUMN_CHROME_PX = 526 - typeTokens.noteSize - typeTokens.centsSize - 2 * space.lg;

/**
 * The dial takes the smallest of: its cap, the width it is given, and the
 * height actually left over.
 *
 * `aspect-ratio` then derives the height from the width, so the dial stays
 * square whichever term wins. The height term must NOT be expressed as a
 * percentage: a percentage height resolves against the parent, whose height is
 * `auto` here, so it would resolve to nothing and silently do nothing.
 *
 * At the viewport where the LINE's column stops fitting — 622px — this leaves
 * the dial 96px, exactly the height the line occupies. So choosing the dial can
 * never cost a player a control that the line would have left on screen.
 */
const SIZE = `min(${MAX_SIZE_PX}px, 100%, calc(100dvh - ${COLUMN_CHROME_PX}px))`;

/**
 * The face's radial budget, as fractions of the radius (G25).
 *
 * Every radial dimension inside the circle is one of these, because the face has
 * to be the same drawing at every size rather than a set of parts that collide
 * as it shrinks: a fixed 10px tick and a fixed 16px label against a
 * proportional ring ran into each other somewhere below a 250px dial, and
 * nothing said so.
 *
 * | ring   | radius        | contents                        |
 * | ------ | ------------- | ------------------------------- |
 * | hub    | 0 → 0.55      | note name and cents readout     |
 * | labels | 0.66 centre   | the twelve segment names        |
 * | needle | 0.78 → 0.96   | the pointer                     |
 * | ticks  | 0.93 → 1.00   | boundary marks and the target   |
 *
 * The needle is OUTBOARD of the labels, not between them and the hub. The
 * target mark and a label share their segment's centre ANGLE, so radius is the
 * only thing that can separate them — labels near the rim would have been
 * stacked on the very mark they exist to sit beside.
 *
 * Stroke widths are exempt: a tick's 2px thickness is tangential rather than
 * radial, and a proportional hairline goes sub-pixel and blurs on a small dial.
 * The needle's width is the one exception, and it earns it below.
 */
const HUB_RADIUS = 0.55;
const LABEL_RADIUS = 0.66;
/**
 * 0.78 rather than the 0.75 this was first drawn at, because the labels used to
 * get proportionally BIGGER as the dial shrank: below a ~275px dial their floor
 * took over from `4cqw`, and at the shortest supported viewport the label
 * reached 0.75R and met the needle. The floor is gone now (see
 * `LABEL_FONT_SIZE`), which removes the growth this was widened for — but the
 * margin is kept rather than spent, since it costs the needle nothing and
 * `dial-hub.spec.ts` runs the ring ordering at five viewport heights either way.
 */
const NEEDLE_INNER_RADIUS = 0.78;
const NEEDLE_OUTER_RADIUS = 0.96;
const TICK_INNER_RADIUS = 0.93;

/**
 * A radius fraction as a percentage of the dial's BOX, measured from its top.
 *
 * The box is a diameter across, so the centre is at 50% and a fraction `f` of
 * the radius is `50f` percentage points either side of it. Everything below
 * that positions something radially goes through here rather than hand-
 * converting, which is where the arithmetic slips.
 */
const fromTop = (radiusFraction: number) => `${50 - 50 * radiusFraction}%`;

/** The same conversion for a radial LENGTH rather than a position. */
const radialSpan = (inner: number, outer: number) => `${50 * (outer - inner)}%`;

/**
 * Type inside the dial, in container query units.
 *
 * `cqw` is 1% of the dial's own width, which is what makes the face scale as
 * one drawing. It cannot be done with a custom property holding the size: the
 * dial's width is a `min()` containing `100%`, and a percentage inside
 * `font-size` resolves against the PARENT'S FONT SIZE rather than its width, so
 * the same expression silently computes something else entirely.
 *
 * The labels get a CEILING but no floor, and the missing floor is the point.
 *
 * They had one — `clamp(10px, 4cqw, 20px)` — on the reasoning that their ring
 * has room to spare in both directions, twelve labels 30° apart at 0.66R being
 * nowhere near touching. That is true of a large dial and false of a small one,
 * because the spacing shrinks with the circle while a floored glyph does not:
 * measured, adjacent labels first touched at a ~90px dial and were a solid
 * smear of 66 overlapping pairs at the 2px dial a 320px-tall window produces.
 *
 * Which is G25's collision exactly — a FIXED length inside the circle fighting
 * a proportional ring — in the one dimension G25's table does not list, the
 * type. Proportional all the way down, the glyph and the gap between glyphs
 * shrink together and the arrangement cannot collide at any size. A tiny dial
 * is then illegible rather than incoherent, which is the better of the two
 * failures and the only one that keeps the face one drawing.
 *
 * The ceiling stays: it stops the labels growing into the needle on a large
 * dial, where the ring genuinely does have room to spare.
 */
const LABEL_FONT_SIZE = `min(4cqw, 20px)`;

/** See the needle below: proportional, with a floor at what it used to be. */
const NEEDLE_WIDTH = `max(6px, 1.7cqw)`;

/**
 * The sizes the hub's contents are drawn at.
 *
 * Exported because the dial does not build the note name and the cents readout
 * — `TunerDisplay` does, and hands them in — but the dial is what knows how big
 * they may be. Passing them explicitly beats letting the atoms inherit an `em`
 * from the hub, which would work identically and say nothing about why.
 *
 * Only meaningful INSIDE the dial: `cqw` resolves against the nearest container
 * ancestor, so these expressions mean nothing beside the horizontal display,
 * which is exactly where neither atom is given a size.
 */
export const DIAL_NOTE_FONT_SIZE = `min(${NOTE_SIZE_RATIO * 100}cqw, ${typeTokens.noteSize}px)`;
export const DIAL_CENTS_FONT_SIZE = `min(${NOTE_SIZE_RATIO * 25}cqw, ${typeTokens.centsSize}px)`;

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
  hub,
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
        : `transform ${motion.markerMs}ms ${motion.easing}, opacity ${motion.colorMs}ms ${motion.easing}`;
    }

    return subscribeToReading((cents, _clarity, midi) => {
      // A lapse holds the needle's ANGLE and fades it out of sight (FR-162).
      //
      // Both halves matter and only the first was built at Phase 3: holding is
      // right because the dial's rest position would name a note, where the
      // line's means nothing — but a needle left visible goes on pointing at a
      // string the player damped, which is what a maintainer reported against
      // the running app. The angle survives the fade in `angleRef`, so the
      // needle comes back where it left rather than sweeping from anywhere
      // (FR-162b).
      //
      // No new timer, and deliberately so: this is the same single lapse edge
      // that returns the line's marker to rest, which is what makes "the two
      // displays go quiet together" (FR-162a) true by construction rather than
      // by two durations that happen to agree.
      if (cents === null || midi === null) {
        if (wrapperRef.current) wrapperRef.current.style.opacity = '0';
        return;
      }

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
      // Written every frame rather than only on the lapse-to-reading edge. The
      // continuous channel carries no edges — tracking one here would mean a
      // second piece of state to keep in step with the session's, and assigning
      // an unchanged inline style costs nothing.
      wrapperRef.current.style.opacity = '1';
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
        width: SIZE,
        aspectRatio: '1 / 1',
        margin: '0 auto',
        // What makes `cqw` inside the dial mean "a percentage of the dial".
        // `inline-size` rather than `size`: the height comes from the aspect
        // ratio, so containing the block axis as well buys nothing and asks the
        // browser for a guarantee this element cannot give.
        containerType: 'inline-size',
        // NOTHING IN THE DIAL IS INTERACTIVE, AND IT MUST NOT ACT AS IF IT IS.
        //
        // The dial reaches further than it looks. Ticks, target and needle are
        // each an `inset: 0` wrapper — a square the size of the whole dial —
        // which is then rotated, because the transform has to go on a concentric
        // element rather than on the mark itself (G21). A rotated square
        // hit-tests over its rotated area, which overhangs the dial's own box by
        // up to ((√2 − 1) / 2) x size: 101px on a 489px dial. Those corners
        // paint nothing, so the reach is invisible until something needs a
        // click.
        //
        // The reference badge sits 24px above the dial and was clickable only at
        // its two extreme ends, which is how this was reported. It was latent
        // before Phase 7 only because the note name and the cents readout stood
        // between the badge and the dial and absorbed the overhang; moving them
        // into the hub removed the padding rather than the reach.
        //
        // One declaration on the root, inherited by every mark inside it, in
        // preference to `overflow: hidden` — which would also clip the reach but
        // would say "the dial is a viewport" when what is true is "the dial is
        // decoration". `aria-hidden` above says the same thing to a different
        // audience. `apps/web/e2e/dial.spec.ts` hit-tests both controls.
        pointerEvents: 'none',
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
              // 2px is a STROKE width, tangential rather than radial, and stays
              // fixed on purpose: a proportional hairline goes sub-pixel and
              // blurs on a small dial. The length beside it is radial and does
              // scale (G25).
              width: 2,
              height: radialSpan(TICK_INNER_RADIUS, 1),
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
              top: 0,
              // Wider than a boundary tick and reaching further in, so the two
              // are told apart by shape as well as by colour (FR-015, SC-070).
              width: 4,
              height: radialSpan(TICK_INNER_RADIUS - 0.03, 1),
              marginLeft: -2,
              background: stateColorVar[state],
            }}
          />
        </div>
      )}

      {/* Twelve labels, upright wherever they sit, at their segment's centre. */}
      {segments.map((pitchClass) => {
        const angle = (pitchClass * DIAL_SEGMENT_DEGREES * Math.PI) / 180;
        const left = 50 + 50 * LABEL_RADIUS * Math.sin(angle);
        const top = 50 - 50 * LABEL_RADIUS * Math.cos(angle);
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
              fontSize: LABEL_FONT_SIZE,
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
          style={{
            position: 'absolute',
            inset: 0,
            // Both animated properties, because both are written here: the
            // angle every frame and the opacity on each lapse edge.
            willChange: 'transform, opacity',
            // The start value the fade transitions FROM. Without it the first
            // lapse animates from the initial value rather than from 1.
            opacity: 1,
          }}
        >
          <div
            data-testid="dial-needle"
            style={{
              position: 'absolute',
              left: '50%',
              // A band in the outer face, no longer reaching the centre: the
              // centre carries the note name and the cents readout (FR-157,
              // FR-168), and a needle through them would cross the text at
              // every angle it can point.
              top: fromTop(NEEDLE_OUTER_RADIUS),
              height: radialSpan(NEEDLE_INNER_RADIUS, NEEDLE_OUTER_RADIUS),
              // The one stroke here that is NOT a fixed width, and the
              // exception is earned: a needle confined to the outer band is a
              // fraction of the length it had when it ran to the centre, and at
              // the old fixed 6px it read as a dash rather than as the dominant
              // indicator FR-021 asks for. Widening it with the dial buys back
              // the presence the length gave up. The floor keeps it from going
              // thinner than it ever was on a small dial.
              width: NEEDLE_WIDTH,
              marginLeft: `calc(${NEEDLE_WIDTH} / -2)`,
              borderRadius: NEEDLE_WIDTH,
              background: stateColorVar[state],
            }}
          />
        </div>
      )}

      {/*
        The hub. Last in the source so it paints above the ticks and rim, and
        centred by the same inset-0 trick everything else here uses.

        `aria-hidden` is inherited from the dial and both atoms already carry
        their own — they are two of the four visual channels the announcer
        speaks as one sentence, so moving them in here exposes nothing and hides
        nothing (G24).
      */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // No `pointer-events` of its own: the root sets it for the whole dial
          // and it inherits. This div carried the declaration first, which was
          // half the rule — the hub is a readout rather than a target, and so is
          // everything else in here.
        }}
      >
        {/* The hub's budget, drawn as an element rather than left implicit in
            the font ratio. It is `HUB_RADIUS` across, so anything that outgrows
            the ring it was given overflows a box a screenshot can see, instead
            of quietly meeting the needle. */}
        <div
          data-testid="dial-hub"
          style={{
            width: `${HUB_RADIUS * 100}%`,
            aspectRatio: '1 / 1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.06em',
            // Only so the `em` gap above has the note's size to resolve
            // against; the children are sized explicitly.
            fontSize: DIAL_NOTE_FONT_SIZE,
          }}
        >
          {hub}
        </div>
      </div>
    </div>
  );
}
