import { palette } from './palette';

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  /** Text on `primary` (brand) fills. */
  textOnPrimary: string;
  /** Text on `inverse` (dark) fills. */
  textOnInverse: string;
  /** Brand fill — never as a text color. */
  primary: string;
  primaryEdge: string;
  /** Small accent text / links. */
  accent: string;
  inverse: string;
  danger: string;
  overlay: string;
}

// Light only for MVP: HANDOFF §5 defines no dark palette yet (app.json forces light).
export const lightColors: ColorTokens = {
  background: palette.cream,
  surface: palette.white,
  surfaceMuted: palette.sandLight,
  border: palette.sand,
  text: palette.ink,
  textMuted: palette.moss,
  textOnPrimary: palette.ink,
  textOnInverse: palette.white,
  primary: palette.brand,
  primaryEdge: palette.forest,
  accent: palette.forest,
  inverse: palette.ink,
  danger: palette.alert,
  overlay: 'rgba(20,38,15,0.4)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** pill — actions; card/sheet 20; input 12. */
export const radius = { input: 12, card: 20, sheet: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 34, lineHeight: 38, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySmall: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export const sizes = {
  /** Minimum touch target (Apple HIG 44pt, Material 48dp). */
  hitTarget: 48,
  buttonPrimary: 56,
  buttonPrimaryEdge: 4,
  listRow: 64,
} as const;

export type TextVariant = keyof typeof typography;
