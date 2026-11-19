import { lightColors, radius, sizes, spacing, typography } from './tokens';

const theme = { colors: lightColors, spacing, radius, typography, sizes, scheme: 'light' } as const;

/** Single light theme for MVP. Kept as a hook so a dark theme can be added without touching callers. */
export function useTheme() {
  return theme;
}

export type Theme = ReturnType<typeof useTheme>;
