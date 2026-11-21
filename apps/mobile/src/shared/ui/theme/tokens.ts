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
  /** Pale brand fill: icon plates, «open» badges. */
  primarySoft: string;
  primaryEdge: string;
  /** Small accent text / links. */
  accent: string;
  /** Border of a focused field: ≥ 3:1 to its fill and clearly unlike `border` (WCAG 1.4.11, #93). */
  focusRing: string;
  inverse: string;
  /** Bottom edge under dark pills. */
  inverseEdge: string;
  /** Overdue / needs attention: row fill, text and dot (design «UI 3»). */
  warningSoft: string;
  warningText: string;
  warningDot: string;
  danger: string;
  overlay: string;
}

// Light only: no dark theme in MVP (owner decision 19.11.2026, docs/PRD.md); app.json forces light.
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
  primarySoft: palette.brandTint,
  primaryEdge: palette.forest,
  accent: palette.forest,
  focusRing: palette.forest,
  inverse: palette.ink,
  inverseEdge: palette.inkEdge,
  warningSoft: palette.amberTint,
  warningText: palette.amberDark,
  warningDot: palette.amber,
  danger: palette.alert,
  overlay: 'rgba(20,38,15,0.4)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Side margin of screens and panels (design canvas: 20). */
export const gutter = 20;

/** pill — actions; card/sheet 20; input 12. */
export const radius = { input: 12, card: 20, sheet: 20, pill: 999 } as const;

/**
 * Geologica, as in the design canvas («UI 3»). Custom fonts on Android ignore `fontWeight`, so every weight is its
 * own family; components never set `fontWeight` themselves. Loaded in `app/_layout.tsx` before the first render.
 */
export const fonts = {
  regular: 'Geologica_400Regular',
  medium: 'Geologica_500Medium',
  semibold: 'Geologica_600SemiBold',
  bold: 'Geologica_700Bold',
  extrabold: 'Geologica_800ExtraBold',
} as const;

export const typography = {
  /** Screen title, left-aligned under the status bar. */
  title: { fontSize: 34, lineHeight: 38, fontFamily: fonts.extrabold, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontFamily: fonts.extrabold },
  /** Section heading above a card («Найближче», «Стан»). */
  section: { fontSize: 18, lineHeight: 24, fontFamily: fonts.extrabold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  bodySmall: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  /** Title of a list row. */
  rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold },
  label: { fontSize: 16, lineHeight: 20, fontFamily: fonts.semibold },
  /** Button text inside rows and pills. */
  labelSmall: { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  /** Short status under a title («Усе вчасно», «прострочено»). */
  captionStrong: { fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold },
  tabLabel: { fontSize: 11, lineHeight: 14, fontFamily: fonts.medium },
} as const;

export const sizes = {
  /** Minimum touch target (Apple HIG 44pt, Material 48dp). */
  hitTarget: 48,
  buttonPrimary: 56,
  buttonPrimaryEdge: 4,
  listRow: 64,
  /** Edge under dark and brand pills inside rows (design: 3px). */
  pillEdge: 3,
} as const;

/** Motion: short and springy; off when the system asks to reduce motion (`useReducedMotion`). */
export const motion = {
  pressScale: 0.97,
  pressIn: { speed: 50, bounciness: 0 },
  pressOut: { speed: 20, bounciness: 6 },
  enterMs: 220,
} as const;

export type TextVariant = keyof typeof typography;

/** Colors the map draws with (base map and pins). The map is a web page, so they go in as plain values. */
export const mapColors = {
  land: palette.mapLand,
  park: palette.mapPark,
  water: palette.mapWater,
  building: palette.mapBuilding,
  road: palette.white,
  pin: palette.ink,
  pinGlyph: palette.brand,
  pinRing: palette.cream,
  mine: palette.brand,
  mineGlyph: palette.ink,
  label: palette.cream,
} as const;

/** The only shadow in the app: for what floats over the map (HANDOFF §5). */
export const floatingShadow = {
  shadowColor: palette.ink,
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;
