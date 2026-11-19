/**
 * Normalizes a Ukrainian mobile number to E.164 (`+380XXXXXXXXX`).
 * Accepts `+380 67 123 45 67`, `380671234567`, `0671234567`, `(067) 123-45-67`.
 * Returns `null` for anything that is not a 9-digit UA subscriber number after the country code.
 */
export function normalizeUaPhone(input: string): string | null {
  const digits = input.replace(/[\s()\-.]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  const bare = digits.replace(/^\+/, '');
  let national: string;
  if (bare.startsWith('380') && bare.length === 12) national = bare.slice(3);
  else if (bare.startsWith('0') && bare.length === 10) national = bare.slice(1);
  else return null;
  // Operator code must not start with 0.
  if (!/^[1-9]\d{8}$/.test(national)) return null;
  return `+380${national}`;
}
