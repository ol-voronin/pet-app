import { buildApp } from './build-app.js';
import { MemoryAuthRepo } from './modules/auth/memory-repo.js';
import { LogOtpSender } from './modules/auth/otp-sender.js';
import { AuthService } from './modules/auth/service.js';

/** Builds the OpenAPI document. Version is fixed so the committed spec is stable. */
export async function generateOpenApi(): Promise<string> {
  const auth = new AuthService({
    repo: new MemoryAuthRepo(),
    sender: new LogOtpSender(),
    secret: 'openapi-export-only-secret-0000000000',
  });
  const app = await buildApp({ version: '0.0.0', auth });
  await app.ready();
  const spec = app.swagger();
  await app.close();
  return `${JSON.stringify(spec, null, 2)}\n`;
}
