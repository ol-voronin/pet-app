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
import { healthModule } from './modules/health/index.js';

export interface AppOptions {
  version: string;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Pet App API', version: opts.version },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthModule, { version: opts.version });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
