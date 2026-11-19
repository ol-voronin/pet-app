import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTP_FIXED_CODE) {
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
