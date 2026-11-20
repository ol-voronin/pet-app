import { z } from 'zod';

const S3_REQUIRED = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

const envSchema = z
  .object({
    /**
     * Where this API runs. Separate from NODE_ENV, which hosts (Vercel) force to "production".
     * `staging` = public test deployment: real infra, but dev OTP is allowed.
     */
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_VERSION: z.string().default('dev'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url(),
    /** HMAC key for access tokens, OTP and refresh-token hashes. */
    JWT_SECRET: z.string().min(32),
    /** Dev only: every OTP equals this code (e.g. 000000), so testers can log in without SMS. */
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    /**
     * Private file bucket, any S3-compatible provider (ADR-0006: Neon Object Storage).
     * Optional as a group: set all of them or none (the API then runs without file uploads).
     */
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z.stringbool().default(true),
    /** Error reports go to Sentry when set; without it nothing is sent anywhere. */
    SENTRY_DSN: z.url().optional(),
    /** Queue and cache (BullMQ). Not used by any module yet; the server compose file already provides it. */
    REDIS_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    const missing = S3_REQUIRED.filter((name) => !env[name]);
    if (missing.length > 0 && missing.length < S3_REQUIRED.length) {
      for (const name of missing) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'required when any other S3_* variable is set',
        });
      }
    }
    if (env.APP_ENV === 'production' && env.OTP_FIXED_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_FIXED_CODE'],
        message: 'must not be set in production',
      });
    }
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
