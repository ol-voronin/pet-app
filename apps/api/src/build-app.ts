import swagger from '@fastify/swagger';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authModule } from './modules/auth/index.js';
import type { AuthService } from './modules/auth/service.js';
import { documentsModule } from './modules/documents/index.js';
import type { DocumentsService } from './modules/documents/service.js';
import { familyModule, inviteLandingModule } from './modules/family/index.js';
import type { FamilyService } from './modules/family/service.js';
import { healthModule } from './modules/health/index.js';
import { petsModule } from './modules/pets/index.js';
import type { PetsService } from './modules/pets/service.js';
import { placesModule } from './modules/places/index.js';
import type { PlacesService } from './modules/places/service.js';
import { registerErrorReporting, type ErrorReporter } from './observability/errors.js';

export interface AppOptions {
  version: string;
  logger?: FastifyServerOptions['logger'];
  /** Auth is optional so lightweight tests (health) can build the app without storage. */
  auth?: AuthService;
  /** Pets routes; need `auth` for the signed-in user. */
  pets?: PetsService;
  /** Pet documents; need `auth`. */
  documents?: DocumentsService;
  /** Family access: invites and members; needs `auth`. */
  family?: FamilyService;
  /** Map places and address search; needs `auth`. */
  places?: PlacesService;
  /** Serve Swagger UI on `/docs`. Off by default: used in local development only. */
  docsUi?: boolean;
  /** Where 5xx errors are reported. Off by default. */
  errors?: ErrorReporter | undefined;
}

/** Creates a Fastify instance with our defaults. */
export function createFastify(logger: FastifyServerOptions['logger'] = false) {
  return Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
}

export type App = ReturnType<typeof createFastify>;

export async function buildApp(opts: AppOptions) {
  return configureApp(createFastify(opts.logger ?? false), opts);
}

/** Registers plugins and modules on an existing instance (the server entry creates it itself). */
export async function configureApp(app: App, opts: AppOptions) {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Before the modules, so the hooks cover every route.
  if (opts.errors) registerErrorReporting(app, opts.errors);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Pet App API', version: opts.version },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  // The spec itself is always available; the UI is optional.
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());
  if (opts.docsUi) {
    // Loaded on demand: @fastify/swagger-ui → @fastify/static require()s an ESM-only package,
    // which Vercel's Node runtime rejects (ERR_REQUIRE_ESM) as soon as the module is imported.
    const { default: swaggerUi } = await import('@fastify/swagger-ui');
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(healthModule, { version: opts.version });
  if (opts.auth) await app.register(authModule, { service: opts.auth });
  if (opts.auth && opts.pets) {
    await app.register(petsModule, { service: opts.pets, auth: opts.auth });
  }
  if (opts.auth && opts.documents) {
    await app.register(documentsModule, { service: opts.documents, auth: opts.auth });
  }
  if (opts.auth && opts.places) {
    await app.register(placesModule, { service: opts.places, auth: opts.auth });
  }
  if (opts.auth && opts.family) {
    await app.register(familyModule, { service: opts.family, auth: opts.auth });
    await app.register(inviteLandingModule);
  }

  return app;
}
