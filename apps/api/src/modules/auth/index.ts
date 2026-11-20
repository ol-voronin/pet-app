import {
  authTokensSchema,
  deleteAccountBodySchema,
  errorResponseSchema,
  otpRequestBodySchema,
  otpRequestResponseSchema,
  otpVerifyBodySchema,
  refreshBodySchema,
  userSchema,
} from '@pet-app/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from './errors.js';
import { createAuthGuard } from './guard.js';
import type { AuthService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  410: errorResponseSchema,
  429: errorResponseSchema,
};

export const authModule: FastifyPluginAsyncZod<{ service: AuthService }> = async (
  app,
  { service },
) => {
  app.setErrorHandler((err: FastifyError | AuthError, _req, reply) => {
    if (err instanceof AuthError) {
      if (err.retryAfterSeconds) void reply.header('retry-after', String(err.retryAfterSeconds));
      return reply.status(err.statusCode).send({ error: err.code });
    }
    if (err.validation)
      return reply.status(400).send({ error: 'validation_error', message: err.message });
    throw err;
  });

  app.decorate('authenticate', createAuthGuard(service));

  app.post(
    '/auth/otp/request',
    {
      schema: {
        operationId: 'requestOtp',
        tags: ['auth'],
        summary: 'Send a one-time code to a Ukrainian phone number',
        body: otpRequestBodySchema,
        response: { 200: otpRequestResponseSchema, ...errors },
      },
    },
    (req) => service.requestOtp(req.body.phone),
  );

  app.post(
    '/auth/otp/verify',
    {
      schema: {
        operationId: 'verifyOtp',
        tags: ['auth'],
        summary: 'Exchange the code for tokens; creates the user on first login',
        body: otpVerifyBodySchema,
        response: { 200: authTokensSchema, ...errors },
      },
    },
    (req) => service.verifyOtp(req.body),
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        operationId: 'refreshTokens',
        tags: ['auth'],
        summary: 'Rotate the refresh token',
        body: refreshBodySchema,
        response: { 200: authTokensSchema, ...errors },
      },
    },
    (req) => service.refresh(req.body.refreshToken),
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        operationId: 'logout',
        tags: ['auth'],
        summary: 'Revoke the session of this refresh token',
        body: refreshBodySchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await service.logout(req.body.refreshToken);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: {
        operationId: 'getMe',
        tags: ['auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        response: { 200: userSchema, 401: errorResponseSchema },
      },
    },
    async (req) => {
      const auth = req.auth;
      if (!auth) throw new AuthError('unauthorized');
      const user = await service.me(auth.userId);
      return { id: user.id, phone: user.phone, name: user.name, locale: user.locale };
    },
  );

  app.delete(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: {
        operationId: 'deleteMe',
        tags: ['auth'],
        summary: 'Delete the current account after OTP confirmation on the user phone',
        security: [{ bearerAuth: [] }],
        body: deleteAccountBodySchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) throw new AuthError('unauthorized');
      await service.deleteAccount(auth.userId, req.body);
      return reply.status(204).send(null);
    },
  );
  return Promise.resolve();
};
