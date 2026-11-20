import { z } from 'zod';
import { normalizeUaPhone } from './phone.js';

export const OTP_LENGTH = 6;

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeUaPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
      return z.NEVER;
    }
    return normalized;
  });

export const otpRequestBodySchema = z.object({ phone: phoneSchema }).meta({ id: 'OtpRequestBody' });

export const otpRequestResponseSchema = z
  .object({
    challengeId: z.uuid(),
    expiresAt: z.iso.datetime(),
    /** Seconds before another code may be requested for this phone. */
    resendAfter: z.number().int().nonnegative(),
  })
  .meta({ id: 'OtpRequestResponse' });

export const otpVerifyBodySchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(new RegExp(`^\\d{${String(OTP_LENGTH)}}$`)),
    deviceName: z.string().max(100).optional(),
  })
  .meta({ id: 'OtpVerifyBody' });

export const userSchema = z
  .object({
    id: z.uuid(),
    phone: z.string().nullable(),
    name: z.string().nullable(),
    locale: z.enum(['uk', 'en']),
  })
  .meta({ id: 'User' });

export const authTokensSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresAt: z.iso.datetime(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.iso.datetime(),
    user: userSchema,
    isNewUser: z.boolean(),
  })
  .meta({ id: 'AuthTokens' });

export const refreshBodySchema = z
  .object({ refreshToken: z.string().min(20) })
  .meta({ id: 'RefreshBody' });

export const deleteAccountBodySchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(new RegExp(`^\\d{${String(OTP_LENGTH)}}$`)),
  })
  .meta({ id: 'DeleteAccountBody' });

export const errorResponseSchema = z
  .object({ error: z.string(), message: z.string().optional() })
  .meta({ id: 'ErrorResponse' });

export type OtpRequestBody = z.infer<typeof otpRequestBodySchema>;
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type ApiUser = z.infer<typeof userSchema>;
