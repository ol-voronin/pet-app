import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', ['uk', 'en']);

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // Nullable: Sign in with Apple/Google may not provide a phone (see DATA_MODEL open question).
  phone: text('phone').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  locale: localeEnum('locale').notNull().default('uk'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
