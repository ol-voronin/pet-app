import { describe, expect, it, vi } from 'vitest';
import { initErrorReporting, resolveSentryDsn, type ErrorSdk } from './errors';

const DSN = 'https://key@o1.ingest.sentry.io/1';

describe('resolveSentryDsn', () => {
  it('prefers the environment variable over app.json', () => {
    expect(resolveSentryDsn(DSN, 'https://other@o1.ingest.sentry.io/2')).toBe(DSN);
  });

  it('falls back to app.json and treats anything else as "off"', () => {
    expect(resolveSentryDsn(undefined, ` ${DSN} `)).toBe(DSN);
    expect(resolveSentryDsn(undefined, '')).toBe('');
    expect(resolveSentryDsn(undefined, undefined)).toBe('');
    expect(resolveSentryDsn(undefined, 42)).toBe('');
  });
});

describe('initErrorReporting', () => {
  it('does not load the SDK without a DSN', async () => {
    const load = vi.fn<() => Promise<ErrorSdk>>();

    await expect(initErrorReporting('', 'production', load)).resolves.toBe(false);

    expect(load).not.toHaveBeenCalled();
  });

  it('starts the SDK without personal data', async () => {
    const init = vi.fn<ErrorSdk['init']>();

    await expect(
      initErrorReporting(DSN, 'production', () => Promise.resolve({ init })),
    ).resolves.toBe(true);

    expect(init).toHaveBeenCalledWith({
      dsn: DSN,
      environment: 'production',
      sendDefaultPii: false,
    });
  });

  it('never breaks app start when the SDK fails to load or start', async () => {
    await expect(
      initErrorReporting(DSN, 'production', () => Promise.reject(new Error('no native module'))),
    ).resolves.toBe(false);
    await expect(
      initErrorReporting(DSN, 'production', () =>
        Promise.resolve({
          init: () => {
            throw new Error('bad dsn');
          },
        }),
      ),
    ).resolves.toBe(false);
  });
});
