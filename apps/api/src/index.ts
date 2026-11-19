import { createDb } from '@pet-app/db';
import { buildApp } from './build-app.js';
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
const app = await buildApp({
  version: config.APP_VERSION,
  logger: { level: config.LOG_LEVEL },
  auth,
  pets,
});
sender.log = app.log;

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
