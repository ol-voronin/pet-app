import { palette } from './palette';

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryPressed: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
}

export const lightColors: ColorTokens = {
  background: palette.neutral50,
  surface: palette.white,
  surfaceMuted: palette.neutral100,
  border: palette.neutral200,
  text: palette.neutral900,
  textMuted: palette.neutral600,
  textOnPrimary: palette.white,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  success: palette.green600,
  warning: palette.amber600,
  danger: palette.red600,
  overlay: 'rgba(0,0,0,0.4)',
};

export const darkColors: ColorTokens = {
  background: palette.black,
  surface: palette.neutral900,
  surfaceMuted: palette.neutral800,
  border: palette.neutral800,
  text: palette.neutral50,
  textMuted: palette.neutral400,
  textOnPrimary: palette.neutral900,
  primary: palette.blue400,
  primaryPressed: palette.blue600,
  success: palette.green400,
  warning: palette.amber400,
  danger: palette.red400,
  overlay: 'rgba(0,0,0,0.6)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const typography = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const hitTarget = 48;

export type TextVariant = keyof typeof typography;
