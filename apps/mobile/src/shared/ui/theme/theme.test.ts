import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { palette } from './palette';
import { lightColors as c } from './tokens';

const AA_TEXT = 4.5;

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('light theme meets WCAG AA for text', () => {
  it.each([
    ['text on background', c.text, c.background],
    ['text on surface', c.text, c.surface],
    ['muted text on surface', c.textMuted, c.surface],
    ['muted text on background', c.textMuted, c.background],
    ['label on brand fill', c.textOnPrimary, c.primary],
    ['label on inverse fill', c.textOnInverse, c.inverse],
    ['accent text on surface', c.accent, c.surface],
    ['accent text on background', c.accent, c.background],
    ['danger text on surface', c.danger, c.surface],
    ['text on muted fill', c.text, c.surfaceMuted],
  ])('%s', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('brand rules (HANDOFF §5)', () => {
  it('white text on brand is forbidden — and indeed fails AA', () => {
    expect(contrastRatio(palette.white, palette.brand)).toBeLessThan(2);
  });
  it('brand color is never used as a text token', () => {
    const textTokens = [c.text, c.textMuted, c.textOnPrimary, c.textOnInverse, c.accent, c.danger];
    expect(textTokens).not.toContain(palette.brand);
  });
});
