import {
  createPlaceBodySchema,
  errorResponseSchema,
  geocodeQuerySchema,
  geocodeResponseSchema,
  placeListSchema,
  placeParamsSchema,
  placeSchema,
  placesInBoxQuerySchema,
  placesInBoxSchema,
  placesNearbyQuerySchema,
  placesSearchQuerySchema,
} from '@pet-app/shared';
import type { FastifyError } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createAuthGuard, requireUserId } from '../auth/guard.js';
import type { AuthService } from '../auth/service.js';
import { PlaceError } from './errors.js';
import type { PlacesService } from './service.js';

const errors = { 400: errorResponseSchema, 401: errorResponseSchema };
const security = [{ bearerAuth: [] }];
const tags = ['places'];

/** Map places: pins for the visible area, lists, search by name and by address, and a person's own markers. */
export const placesModule: FastifyPluginAsyncZod<{
  service: PlacesService;
  auth: AuthService;
}> = (app, { service, auth }) => {
  app.setErrorHandler((err: FastifyError | AuthError | PlaceError, _req, reply) => {
    if (err instanceof AuthError || err instanceof PlaceError) {
      return reply.status(err.statusCode).send({ error: err.code });
    }
    if (err.validation)
      return reply.status(400).send({ error: 'validation_error', message: err.message });
    throw err;
  });

  app.addHook('onRequest', createAuthGuard(auth));

  app.get(
    '/places',
    {
      schema: {
        operationId: 'listPlacesInBox',
        tags,
        summary: 'Pins inside the visible part of the map',
        security,
        querystring: placesInBoxQuerySchema,
        response: { 200: placesInBoxSchema, ...errors },
      },
    },
    (req) => service.inBox(requireUserId(req), req.query),
  );

  app.get(
    '/places/nearby',
    {
      schema: {
        operationId: 'listPlacesNearby',
        tags,
        summary: 'Places around a point, nearest first',
        security,
        querystring: placesNearbyQuerySchema,
        response: { 200: placeListSchema, ...errors },
      },
    },
    async (req) => ({ places: await service.nearby(requireUserId(req), req.query) }),
  );

  app.get(
    '/places/search',
    {
      schema: {
        operationId: 'searchPlaces',
        tags,
        summary: 'Search places by name; typos and a wrong keyboard layout are forgiven',
        security,
        querystring: placesSearchQuerySchema,
        response: { 200: placeListSchema, ...errors },
      },
    },
    async (req) => ({ places: await service.search(requireUserId(req), req.query) }),
  );

  app.get(
    '/places/:placeId',
    {
      schema: {
        operationId: 'getPlace',
        tags,
        summary: 'Place card',
        security,
        params: placeParamsSchema,
        response: { 200: placeSchema, ...errors, 404: errorResponseSchema },
      },
    },
    (req) => service.get(requireUserId(req), req.params.placeId),
  );

  app.post(
    '/places',
    {
      schema: {
        operationId: 'createPlace',
        tags,
        summary: 'Add own marker: private at once, public after moderation',
        security,
        body: createPlaceBodySchema,
        response: { 201: placeSchema, ...errors, 409: errorResponseSchema },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createOwn(requireUserId(req), req.body)),
  );

  app.delete(
    '/places/:placeId',
    {
      schema: {
        operationId: 'deletePlace',
        tags,
        summary: 'Remove own marker',
        security,
        params: placeParamsSchema,
        response: { 204: z.null(), ...errors, 404: errorResponseSchema },
      },
    },
    async (req, reply) => {
      await service.deleteOwn(requireUserId(req), req.params.placeId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/geocode',
    {
      schema: {
        operationId: 'geocodeAddress',
        tags,
        summary: 'Search an address in Ukraine',
        security,
        querystring: geocodeQuerySchema,
        response: { 200: geocodeResponseSchema, ...errors, 503: errorResponseSchema },
      },
    },
    async (req) => ({ results: await service.geocode(req.query) }),
  );
  return Promise.resolve();
};
