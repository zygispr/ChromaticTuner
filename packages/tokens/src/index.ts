/**
 * @chromatic-tuner/tokens
 *
 * The single source of truth for colour, spacing, type scale, and motion —
 * Constitution Principle IV and FR-018. Both apps consume this package; a
 * hard-coded literal colour, spacing, or duration in either app is a lint error.
 *
 * Zero runtime dependencies, so a React bundle and a React Native bundle can
 * both consume it (plan.md Complexity Tracking C4).
 */

export { color } from './colors';
export type { ColorToken, ThemedColor } from './colors';

export { space } from './space';
export type { SpaceToken } from './space';

export { type } from './type';
export type { TypeToken } from './type';

export { motion } from './motion';
export type { MotionToken } from './motion';

export { a11y } from './a11y';
export type { A11yToken } from './a11y';
