import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const authProviderEnum = pgEnum('auth_provider', ['phone', 'apple', 'google']);

/** How a user signs in. One user can have several identities (phone + Apple, …). */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    /** E.164 phone for `phone`, provider `sub` for Apple/Google. */
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    unique('auth_identities_provider_subject_unique').on(t.provider, t.subject),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

/** Refresh sessions. Only a hash of the refresh token is stored; tokens rotate on every refresh. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    /** All sessions created by rotating one login share a family; reuse of a rotated token revokes the family. */
    familyId: uuid('family_id').notNull(),
    deviceName: text('device_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_family_idx').on(t.familyId)],
);

/** One-time codes sent by SMS/Viber. Only a hash of the code is stored. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('otp_challenges_phone_created_idx').on(t.phone, t.createdAt)],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
