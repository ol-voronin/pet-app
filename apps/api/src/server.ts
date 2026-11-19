import { createDb } from '@pet-app/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { DrizzleAuthRepo } from './modules/auth/drizzle-repo.js';
import { LogOtpSender } from './modules/auth/otp-sender.js';
import { AuthService } from './modules/auth/service.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  // Real Viber/SMS delivery is a separate task; refuse to start rather than log codes in production.
  throw new Error('No production OTP sender configured yet');
}

const sender = new LogOtpSender();
const auth = new AuthService({
  repo: new DrizzleAuthRepo(createDb(config.DATABASE_URL)),
  sender,
  secret: config.JWT_SECRET,
  ...(config.OTP_FIXED_CODE ? { fixedOtp: config.OTP_FIXED_CODE } : {}),
});
const app = await buildApp({
  version: config.APP_VERSION,
  logger: { level: config.LOG_LEVEL },
  auth,
});
sender.log = app.log;

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
