import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { petRoleEnum, pets } from './pets.js';
import { users } from './users.js';

/**
 * Family invite by link. One invite is for one person and can cover several pets
 * (`pet_invite_pets`). Only a hash of the link token is stored.
 */
export const petInvites = pgTable(
  'pet_invites',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tokenHash: text('token_hash').notNull().unique(),
    /** `editor` or `viewer`; an invite never grants `owner`. */
    role: petRoleEnum('role').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('pet_invites_created_by_idx').on(t.createdBy)],
);

/** Pets an invite gives access to. */
export const petInvitePets = pgTable(
  'pet_invite_pets',
  {
    inviteId: uuid('invite_id')
      .notNull()
      .references(() => petInvites.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.petId] })],
);

export type PetInvite = typeof petInvites.$inferSelect;
