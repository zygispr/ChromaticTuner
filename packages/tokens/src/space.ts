/** Spacing scale, in density-independent units (px on web, dp/pt on mobile). */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export type SpaceToken = keyof typeof space;
