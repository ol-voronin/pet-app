import type { FastifyRequest } from 'fastify';
import { AuthError } from './errors.js';
import type { AuthService } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; sessionId: string };
  }
}

/** `onRequest` hook: requires a valid access token and puts the claims on `req.auth`. */
export function createAuthGuard(service: AuthService) {
  return async (req: FastifyRequest): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AuthError('unauthorized');
    req.auth = await service.authenticate(header.slice('Bearer '.length));
  };
}

/** The authenticated user id; call only in routes behind the guard. */
export function requireUserId(req: FastifyRequest): string {
  if (!req.auth) throw new AuthError('unauthorized');
  return req.auth.userId;
}
