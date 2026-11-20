import {
  acceptedInviteSchema,
  createdInviteSchema,
  createInviteBodySchema,
  errorResponseSchema,
  inviteOptionsSchema,
  inviteParamsSchema,
  invitePreviewSchema,
  inviteTokenBodySchema,
  petMemberParamsSchema,
  petMembersSchema,
  petParamsSchema,
} from '@pet-app/shared';
import type { FastifyError } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createAuthGuard, requireUserId } from '../auth/guard.js';
import type { AuthService } from '../auth/service.js';
import { FamilyError } from './errors.js';
import type { FamilyService } from './service.js';

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  410: errorResponseSchema,
};
const security = [{ bearerAuth: [] }];
const tags = ['family'];

export const familyModule: FastifyPluginAsyncZod<{
  service: FamilyService;
  auth: AuthService;
}> = async (app, { service, auth }) => {
  app.setErrorHandler((err: FastifyError | AuthError | FamilyError, _req, reply) => {
    if (err instanceof AuthError || err instanceof FamilyError) {
      return reply.status(err.statusCode).send({ error: err.code });
    }
    if (err.validation)
      return reply.status(400).send({ error: 'validation_error', message: err.message });
    throw err;
  });

  // Every family route needs a signed-in user.
  app.addHook('onRequest', createAuthGuard(auth));

  app.get(
    '/invites/options',
    {
      schema: {
        operationId: 'getInviteOptions',
        tags,
        summary: 'Pets the user can invite to, and whether each has room under the member limit',
        security,
        response: { 200: inviteOptionsSchema, 401: errorResponseSchema },
      },
    },
    (req) => service.options(requireUserId(req)),
  );

  app.post(
    '/invites',
    {
      schema: {
        operationId: 'createInvite',
        tags,
        summary: 'Create a family invite link for one person; it can cover several pets',
        security,
        body: createInviteBodySchema,
        response: { 201: createdInviteSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createInvite(requireUserId(req), req.body)),
  );

  app.post(
    '/invites/preview',
    {
      schema: {
        operationId: 'previewInvite',
        tags,
        summary: 'Who invites, to which pets and with what role — before accepting',
        security,
        body: inviteTokenBodySchema,
        response: { 200: invitePreviewSchema, ...errors },
      },
    },
    (req) => service.preview(requireUserId(req), req.body.token),
  );

  app.post(
    '/invites/accept',
    {
      schema: {
        operationId: 'acceptInvite',
        tags,
        summary: 'Accept an invite: join every pet it covers',
        security,
        body: inviteTokenBodySchema,
        response: { 200: acceptedInviteSchema, ...errors },
      },
    },
    (req) => service.accept(requireUserId(req), req.body.token),
  );

  app.delete(
    '/invites/:inviteId',
    {
      schema: {
        operationId: 'revokeInvite',
        tags,
        summary: 'Cancel an invite that nobody has accepted yet',
        security,
        params: inviteParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      await service.revokeInvite(requireUserId(req), req.params.inviteId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/pets/:petId/members',
    {
      schema: {
        operationId: 'listPetMembers',
        tags,
        summary: 'People who have access to the pet',
        security,
        params: petParamsSchema,
        response: { 200: petMembersSchema, ...errors },
      },
    },
    (req) => service.members(requireUserId(req), req.params.petId),
  );

  app.delete(
    '/pets/:petId/members/:userId',
    {
      schema: {
        operationId: 'removePetMember',
        tags,
        summary: 'Take access away from a member (owner), or leave the pet (the member)',
        security,
        params: petMemberParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (req, reply) => {
      await service.removeMember(requireUserId(req), req.params.petId, req.params.userId);
      return reply.status(204).send(null);
    },
  );
  return Promise.resolve();
};

const tokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/) });

/**
 * Public page behind the shared link. Messengers only make https links tappable, so the link
 * points here and the page hands over to the app. It says nothing about the invite itself.
 */
export const inviteLandingModule: FastifyPluginAsyncZod = async (app) => {
  app.get('/invite/:token', { schema: { hide: true, params: tokenParams } }, async (req, reply) => {
    // The token is limited to URL-safe characters by the schema, so it is safe to print.
    const { token } = req.params;
    const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Запрошення — Pet App</title>
<style>
body{margin:0;padding:32px 24px;background:#FAF7F0;color:#14260F;font:16px/24px system-ui,sans-serif}
h1{font-size:28px;line-height:32px;margin:0 0 12px}
a.button{display:block;margin:24px 0;padding:16px;border-radius:999px;background:#14260F;color:#fff;
text-align:center;text-decoration:none;font-weight:600}
code{display:block;padding:12px;border-radius:12px;background:#fff;word-break:break-all}
p{color:#4A5644}
</style>
</head>
<body>
<h1>Вас запросили доглядати за улюбленцем</h1>
<p>Відкрийте запрошення в застосунку Pet App.</p>
<a class="button" href="petapp://invite/${token}">Відкрити в застосунку</a>
<p>Якщо застосунок не відкрився: Pet App → Профіль → «У мене є запрошення» і вставте це посилання або код:</p>
<code>${token}</code>
</body>
</html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
  return Promise.resolve();
};
