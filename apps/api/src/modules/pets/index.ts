import {
  createPetBodySchema,
  errorResponseSchema,
  petListSchema,
  petParamsSchema,
  petPhotoUploadBodySchema,
  petPhotoUploadResponseSchema,
  petSchema,
  setPetPhotoBodySchema,
  updatePetBodySchema,
} from '@pet-app/shared';
import type { FastifyError } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createAuthGuard, requireUserId } from '../auth/guard.js';
import type { AuthService } from '../auth/service.js';
import { StorageError } from '../storage/index.js';
import { PetError } from './errors.js';
import type { PetsService } from './service.js';

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
};
const photoErrors = {
  ...errors,
  409: errorResponseSchema,
  413: errorResponseSchema,
  415: errorResponseSchema,
  503: errorResponseSchema,
};
const security = [{ bearerAuth: [] }];
const tags = ['pets'];

export const petsModule: FastifyPluginAsyncZod<{
  service: PetsService;
  auth: AuthService;
}> = async (app, { service, auth }) => {
  app.setErrorHandler((err: FastifyError | AuthError | PetError | StorageError, _req, reply) => {
    if (err instanceof AuthError || err instanceof PetError || err instanceof StorageError) {
      return reply.status(err.statusCode).send({ error: err.code });
    }
    if (err.validation)
      return reply.status(400).send({ error: 'validation_error', message: err.message });
    throw err;
  });

  // Every pets route needs a signed-in user.
  app.addHook('onRequest', createAuthGuard(auth));

  app.post(
    '/pets',
    {
      schema: {
        operationId: 'createPet',
        tags,
        summary: 'Add a pet; the current user becomes its owner',
        security,
        body: createPetBodySchema,
        response: { 201: petSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.create(requireUserId(req), req.body)),
  );

  app.get(
    '/pets',
    {
      schema: {
        operationId: 'listPets',
        tags,
        summary: 'Pets the current user owns or has access to',
        security,
        response: { 200: petListSchema, 401: errorResponseSchema },
      },
    },
    async (req) => ({ pets: await service.list(requireUserId(req)) }),
  );

  app.get(
    '/pets/:petId',
    {
      schema: {
        operationId: 'getPet',
        tags,
        summary: 'One pet',
        security,
        params: petParamsSchema,
        response: { 200: petSchema, ...errors },
      },
    },
    (req) => service.get(requireUserId(req), req.params.petId),
  );

  app.patch(
    '/pets/:petId',
    {
      schema: {
        operationId: 'updatePet',
        tags,
        summary: 'Change pet fields (owner or editor); null clears an optional field',
        security,
        params: petParamsSchema,
        body: updatePetBodySchema,
        response: { 200: petSchema, ...errors, 409: errorResponseSchema },
      },
    },
    (req) => service.update(requireUserId(req), req.params.petId, req.body),
  );

  app.delete(
    '/pets/:petId',
    {
      schema: {
        operationId: 'deletePet',
        tags,
        summary: 'Delete a pet (owner only)',
        security,
        params: petParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      await service.remove(requireUserId(req), req.params.petId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/pets/:petId/photo/upload',
    {
      schema: {
        operationId: 'startPetPhotoUpload',
        tags,
        summary: 'Get a signed URL to upload a pet photo (step 1 of 2)',
        security,
        params: petParamsSchema,
        body: petPhotoUploadBodySchema,
        response: { 200: petPhotoUploadResponseSchema, ...photoErrors },
      },
    },
    (req) => service.startPhotoUpload(requireUserId(req), req.params.petId, req.body),
  );

  app.put(
    '/pets/:petId/photo',
    {
      schema: {
        operationId: 'setPetPhoto',
        tags,
        summary: 'Attach the uploaded photo to the pet (step 2 of 2)',
        security,
        params: petParamsSchema,
        body: setPetPhotoBodySchema,
        response: { 200: petSchema, ...photoErrors },
      },
    },
    (req) => service.setPhoto(requireUserId(req), req.params.petId, req.body.key),
  );

  app.delete(
    '/pets/:petId/photo',
    {
      schema: {
        operationId: 'deletePetPhoto',
        tags,
        summary: 'Remove the pet photo; the card shows the avatar again',
        security,
        params: petParamsSchema,
        response: { 200: petSchema, ...errors },
      },
    },
    (req) => service.removePhoto(requireUserId(req), req.params.petId),
  );
  return Promise.resolve();
};
