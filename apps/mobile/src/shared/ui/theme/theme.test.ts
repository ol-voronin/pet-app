import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { darkColors, lightColors, type ColorTokens } from './tokens';

const AA_TEXT = 4.5;

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as [string, ColorTokens][])('%s theme meets WCAG AA for text', (_name, c) => {
  it.each([
    ['text on background', c.text, c.background],
    ['text on surface', c.text, c.surface],
    ['muted text on surface', c.textMuted, c.surface],
    ['muted text on background', c.textMuted, c.background],
    ['button label on primary', c.textOnPrimary, c.primary],
    ['danger text on surface', c.danger, c.surface],
    ['primary (link) on surface', c.primary, c.surface],
  ])('%s', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
