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
    ['danger text on background', c.danger, c.background],
    ['danger text on a held text button', c.danger, c.surfaceMuted],
    ['text on muted fill', c.text, c.surfaceMuted],
    ['overdue text on overdue row', c.warningText, c.warningSoft],
    ['muted text on overdue row', c.textMuted, c.warningSoft],
    ['text on overdue row', c.text, c.warningSoft],
    ['accent badge on pale brand fill', c.accent, c.primarySoft],
    ['text on pale brand fill', c.text, c.primarySoft],
  ])('%s', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

// WCAG 1.4.11: borders and state indicators need 3:1 against what is around them.
const AA_NON_TEXT = 3;

describe('light theme meets WCAG AA for focus and indicators (#93)', () => {
  it.each([
    ['focus ring on a white field', c.focusRing, c.surface],
    ['focus ring on the screen background', c.focusRing, c.background],
    ['focus ring vs the unfocused border', c.focusRing, c.border],
    ['overdue dot on white', c.warningDot, c.surface],
  ])('%s', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
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
