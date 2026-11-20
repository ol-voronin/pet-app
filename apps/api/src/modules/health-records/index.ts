import {
  createHealthRecordBodySchema,
  errorResponseSchema,
  healthRecordListQuerySchema,
  healthRecordListSchema,
  healthRecordParamsSchema,
  healthRecordSchema,
  healthRecordVersionListSchema,
  petParamsSchema,
  updateHealthRecordBodySchema,
} from '@pet-app/shared';
import type { FastifyError } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createAuthGuard, requireUserId } from '../auth/guard.js';
import type { AuthService } from '../auth/service.js';
import { HealthRecordError } from './errors.js';
import type { HealthRecordsService } from './service.js';

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
};
const security = [{ bearerAuth: [] }];
const tags = ['health-records'];

export const healthRecordsModule: FastifyPluginAsyncZod<{
  service: HealthRecordsService;
  auth: AuthService;
}> = async (app, { service, auth }) => {
  app.setErrorHandler((err: FastifyError | AuthError | HealthRecordError, _req, reply) => {
    if (err instanceof HealthRecordError) {
      return reply
        .status(err.statusCode)
        .send({ error: err.code, ...(err.detail ? { message: err.detail } : {}) });
    }
    if (err instanceof AuthError) return reply.status(err.statusCode).send({ error: err.code });
    if (err.validation)
      return reply.status(400).send({ error: 'validation_error', message: err.message });
    throw err;
  });

  // Medical records are never public: every route needs a signed-in member of the pet.
  app.addHook('onRequest', createAuthGuard(auth));

  app.get(
    '/pets/:petId/health-records',
    {
      schema: {
        operationId: 'listHealthRecords',
        tags,
        summary: 'Medical history of a pet, newest first; the whole history on every plan',
        security,
        params: petParamsSchema,
        querystring: healthRecordListQuerySchema,
        response: { 200: healthRecordListSchema, ...errors },
      },
    },
    async (req) => ({
      records: await service.list(requireUserId(req), req.params.petId, req.query),
    }),
  );

  app.post(
    '/pets/:petId/health-records',
    {
      schema: {
        operationId: 'createHealthRecord',
        tags,
        summary: 'Add a record by hand (owner or editor); source is set to manual',
        security,
        params: petParamsSchema,
        body: createHealthRecordBodySchema,
        response: { 201: healthRecordSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.create(requireUserId(req), req.params.petId, req.body)),
  );

  app.get(
    '/pets/:petId/health-records/:recordId',
    {
      schema: {
        operationId: 'getHealthRecord',
        tags,
        summary: 'One record',
        security,
        params: healthRecordParamsSchema,
        response: { 200: healthRecordSchema, ...errors },
      },
    },
    (req) => service.get(requireUserId(req), req.params.petId, req.params.recordId),
  );

  app.patch(
    '/pets/:petId/health-records/:recordId',
    {
      schema: {
        operationId: 'updateHealthRecord',
        tags,
        summary:
          'Change a record (owner or editor): the previous state is kept as a version; null clears an optional field',
        security,
        params: healthRecordParamsSchema,
        body: updateHealthRecordBodySchema,
        response: { 200: healthRecordSchema, ...errors, 409: errorResponseSchema },
      },
    },
    (req) => service.update(requireUserId(req), req.params.petId, req.params.recordId, req.body),
  );

  app.delete(
    '/pets/:petId/health-records/:recordId',
    {
      schema: {
        operationId: 'deleteHealthRecord',
        tags,
        summary: 'Delete a record (owner or editor); it is hidden, not erased',
        security,
        params: healthRecordParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      await service.remove(requireUserId(req), req.params.petId, req.params.recordId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/pets/:petId/health-records/:recordId/versions',
    {
      schema: {
        operationId: 'listHealthRecordVersions',
        tags,
        summary: 'Replaced versions of a record, newest first, with who changed it and when',
        security,
        params: healthRecordParamsSchema,
        response: { 200: healthRecordVersionListSchema, ...errors },
      },
    },
    async (req) => ({
      versions: await service.versions(requireUserId(req), req.params.petId, req.params.recordId),
    }),
  );
  return Promise.resolve();
};
