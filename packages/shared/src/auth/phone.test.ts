import { describe, expect, it } from 'vitest';
import { normalizeUaPhone } from './phone.js';

describe('normalizeUaPhone', () => {
  it.each([
    ['+380671234567', '+380671234567'],
    ['380671234567', '+380671234567'],
    ['0671234567', '+380671234567'],
    ['+38 (067) 123-45-67', '+380671234567'],
    ['067 123 45 67', '+380671234567'],
    ['0931112233', '+380931112233'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUaPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '+48123456789', // Poland
    '+3806712345678', // too long
    '067123456', // too short
    '+3800671234567',
    '0071234567', // operator code starts with 0
    'abc0671234567',
    '+380 67 123 45 6x',
  ])('rejects %j', (input) => {
    expect(normalizeUaPhone(input)).toBeNull();
  });
});
