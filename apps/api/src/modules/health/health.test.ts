import { healthResponseSchema } from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';

describe('GET /health', () => {
  let app: App;
  beforeAll(async () => {
    app = await buildApp({ version: '1.2.3' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns ok with version and ISO time', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.version).toBe('1.2.3');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
