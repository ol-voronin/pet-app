import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
import { healthModule } from './modules/health/index.js';

export interface AppOptions {
  version: string;
  logger?: FastifyServerOptions['logger'];
  /** Auth is optional so lightweight tests (health) can build the app without storage. */
  auth?: AuthService;
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
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthModule, { version: opts.version });
  if (opts.auth) await app.register(authModule, { service: opts.auth });

  return app;
}
