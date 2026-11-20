import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('allows the fixed dev OTP outside production', () => {
    for (const APP_ENV of ['development', 'staging'] as const) {
      expect(loadConfig({ ...base, APP_ENV, OTP_FIXED_CODE: '000000' }).OTP_FIXED_CODE).toBe(
        '000000',
      );
    }
  });

  it('forbids the fixed dev OTP in production', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', OTP_FIXED_CODE: '000000' })).toThrow(
      /OTP_FIXED_CODE/,
    );
  });

  it('requires a long JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow();
  });

  it('treats empty variables as not set', () => {
    const config = loadConfig({ ...base, SENTRY_DSN: '', GEOCODER_URL: '', OTP_FIXED_CODE: '' });
    expect(config.SENTRY_DSN).toBeUndefined();
    expect(config.GEOCODER_URL).toBeUndefined();
    expect(config.OTP_FIXED_CODE).toBeUndefined();
  });

  it('still requires the database address', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
