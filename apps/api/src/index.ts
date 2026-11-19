import { createDb } from '@pet-app/db';
import Fastify from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { configureApp } from './build-app.js';
import { loadConfig } from './config.js';
import { DrizzleAuthRepo } from './modules/auth/drizzle-repo.js';
import { LogOtpSender } from './modules/auth/otp-sender.js';
import { AuthService } from './modules/auth/service.js';
import { DrizzlePetsRepo } from './modules/pets/drizzle-repo.js';
import { PetsService } from './modules/pets/service.js';
import { createStorage } from './modules/storage/index.js';

const config = loadConfig();
if (config.APP_ENV === 'production') {
  // Real Viber/SMS delivery is a separate task; refuse to start rather than log codes in production.
  throw new Error('No production OTP sender configured yet');
}

const sender = new LogOtpSender();
const db = createDb(config.DATABASE_URL);
const auth = new AuthService({
  repo: new DrizzleAuthRepo(db),
  sender,
  secret: config.JWT_SECRET,
  ...(config.OTP_FIXED_CODE ? { fixedOtp: config.OTP_FIXED_CODE } : {}),
});
const pets = new PetsService({ repo: new DrizzlePetsRepo(db), storage: createStorage(config) });
// Fastify is created here (not in build-app) because Vercel's Fastify preset looks for the file that imports it.
const app = Fastify({ logger: { level: config.LOG_LEVEL } }).withTypeProvider<ZodTypeProvider>();
await configureApp(app, {
  version: config.APP_VERSION,
  auth,
  pets,
  // Swagger UI only locally: its dependency chain does not load on Vercel's Node runtime.
  docsUi: config.APP_ENV === 'development',
});
sender.log = app.log;

// Not awaited: Vercel's Fastify preset takes over `listen`, and a top-level await on it never
// settles there, so the function would hang on every request.
app.listen({ host: config.HOST, port: config.PORT }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
