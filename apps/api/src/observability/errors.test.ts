import { describe, expect, it } from 'vitest';
import { buildApp } from '../build-app.js';
import { createErrorReporter, type ErrorContext, type ErrorReporter } from './errors.js';

class FakeReporter implements ErrorReporter {
  readonly captured: { error: unknown; context: ErrorContext }[] = [];
  capture(error: unknown, context: ErrorContext): void {
    this.captured.push({ error, context });
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

async function appWith(reporter: ErrorReporter) {
  const app = await buildApp({ version: 'test', errors: reporter });
  app.get('/boom/:id', () => {
    throw new Error('database is down');
  });
  app.get('/teapot', () => {
    throw Object.assign(new Error('not for you'), { statusCode: 418 });
  });
  return app;
}

describe('error reporting', () => {
  it('reports an unexpected error once, with the route pattern and no ids', async () => {
    const reporter = new FakeReporter();
    const app = await appWith(reporter);

    const res = await app.inject({ method: 'GET', url: '/boom/42?token=secret' });

    expect(res.statusCode).toBe(500);
    expect(reporter.captured).toHaveLength(1);
    const [report] = reporter.captured;
    expect((report?.error as Error).message).toBe('database is down');
    expect(report?.context).toMatchObject({ method: 'GET', route: '/boom/:id', statusCode: 500 });
    expect(JSON.stringify(report?.context)).not.toContain('42');
    expect(JSON.stringify(report?.context)).not.toContain('secret');
  });

  it('does not report expected failures (4xx) or successful requests', async () => {
    const reporter = new FakeReporter();
    const app = await appWith(reporter);

    expect((await app.inject({ method: 'GET', url: '/teapot' })).statusCode).toBe(418);
    expect((await app.inject({ method: 'GET', url: '/no-such-route' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);

    expect(reporter.captured).toHaveLength(0);
  });

  it('is switched off without a DSN', async () => {
    await expect(
      createErrorReporter({ APP_ENV: 'staging', APP_VERSION: 'test' }),
    ).resolves.toBeUndefined();
  });
});
