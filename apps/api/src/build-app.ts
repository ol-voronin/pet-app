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

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false }).withTypeProvider<ZodTypeProvider>();
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

export type App = Awaited<ReturnType<typeof buildApp>>;
