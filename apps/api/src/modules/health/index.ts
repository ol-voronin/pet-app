import { healthResponseSchema } from '@pet-app/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthModule: FastifyPluginAsyncZod<{ version: string }> = (app, opts) => {
  app.get(
    '/health',
    {
      schema: {
        operationId: 'getHealth',
        tags: ['system'],
        summary: 'Liveness check',
        response: { 200: healthResponseSchema },
      },
    },
    () => ({ status: 'ok' as const, version: opts.version, time: new Date().toISOString() }),
  );
  return Promise.resolve();
};
