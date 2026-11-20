import {
  confirmDocumentBodySchema,
  documentListSchema,
  documentParamsSchema,
  documentSchema,
  documentUploadBodySchema,
  documentUploadResponseSchema,
  downloadTargetSchema,
  errorResponseSchema,
  petParamsSchema,
} from '@pet-app/shared';
import type { FastifyError } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createAuthGuard, requireUserId } from '../auth/guard.js';
import type { AuthService } from '../auth/service.js';
import { StorageError } from '../storage/index.js';
import { DocumentError } from './errors.js';
import type { DocumentsService } from './service.js';

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
};
const storageErrors = {
  ...errors,
  409: errorResponseSchema,
  413: errorResponseSchema,
  415: errorResponseSchema,
  503: errorResponseSchema,
};
const security = [{ bearerAuth: [] }];
const tags = ['documents'];

export const documentsModule: FastifyPluginAsyncZod<{
  service: DocumentsService;
  auth: AuthService;
}> = async (app, { service, auth }) => {
  app.setErrorHandler(
    (err: FastifyError | AuthError | DocumentError | StorageError, _req, reply) => {
      if (err instanceof AuthError || err instanceof DocumentError || err instanceof StorageError) {
        return reply.status(err.statusCode).send({ error: err.code });
      }
      if (err.validation) {
        return reply.status(400).send({ error: 'validation_error', message: err.message });
      }
      throw err;
    },
  );

  // Every document route needs a signed-in user.
  app.addHook('onRequest', createAuthGuard(auth));

  app.post(
    '/pets/:petId/documents/upload',
    {
      schema: {
        operationId: 'startDocumentUpload',
        tags,
        summary: 'Get a signed URL to upload a pet document (step 1 of 2)',
        security,
        params: petParamsSchema,
        body: documentUploadBodySchema,
        response: { 200: documentUploadResponseSchema, ...storageErrors },
      },
    },
    (req) => service.startUpload(requireUserId(req), req.params.petId, req.body),
  );

  app.post(
    '/pets/:petId/documents',
    {
      schema: {
        operationId: 'confirmDocumentUpload',
        tags,
        summary: 'Save the uploaded document as stored without OCR (step 2 of 2)',
        security,
        params: petParamsSchema,
        body: confirmDocumentBodySchema,
        response: { 201: documentSchema, ...storageErrors },
      },
    },
    async (req, reply) =>
      reply
        .status(201)
        .send(await service.confirmUpload(requireUserId(req), req.params.petId, req.body)),
  );

  app.get(
    '/pets/:petId/documents',
    {
      schema: {
        operationId: 'listDocuments',
        tags,
        summary: 'List pet documents (newest first)',
        security,
        params: petParamsSchema,
        response: { 200: documentListSchema, ...errors },
      },
    },
    async (req) => ({ documents: await service.list(requireUserId(req), req.params.petId) }),
  );

  app.get(
    '/pets/:petId/documents/:documentId/download',
    {
      schema: {
        operationId: 'getDocumentDownloadUrl',
        tags,
        summary: 'Get a short-lived signed URL to read a pet document',
        security,
        params: documentParamsSchema,
        response: { 200: downloadTargetSchema, ...errors, 503: errorResponseSchema },
      },
    },
    (req) => service.getDownloadUrl(requireUserId(req), req.params.petId, req.params.documentId),
  );

  app.delete(
    '/pets/:petId/documents/:documentId',
    {
      schema: {
        operationId: 'deleteDocument',
        tags,
        summary: 'Soft-delete a pet document (owner or editor)',
        security,
        params: documentParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      await service.remove(requireUserId(req), req.params.petId, req.params.documentId);
      return reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};
