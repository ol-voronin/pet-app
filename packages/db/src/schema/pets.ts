import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const petSpeciesEnum = pgEnum('pet_species', ['dog', 'cat', 'other']);
export const petSexEnum = pgEnum('pet_sex', ['male', 'female']);
export const petHeroEnum = pgEnum('pet_hero', ['avatar', 'photo']);
export const petRoleEnum = pgEnum('pet_role', ['owner', 'editor', 'viewer']);

/** Avatar constructor parameters (MVP: dog and cat only). Rendered image key is `avatar_key`. */
export interface PetAvatar {
  species: 'dog' | 'cat';
  ears: string;
  muzzle: string;
  coat: string;
  color: string;
  renderVersion: number;
}

export const pets = pgTable('pets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  species: petSpeciesEnum('species').notNull(),
  breed: text('breed'),
  sex: petSexEnum('sex'),
  /** Calendar date, no time zone: a birthday does not shift between zones. */
  birthDate: date('birth_date', { mode: 'string' }),
  color: text('color'),
  sterilized: boolean('sterilized'),
  chipNumber: text('chip_number'),
  registryNumber: text('registry_number'),
  tagNumber: text('tag_number'),
  notes: text('notes'),
  hidden: boolean('hidden').notNull().default(false),
  avatar: jsonb('avatar').$type<PetAvatar>(),
  /** Object keys in the private bucket (ADR-0006). URLs are signed on read, never stored. */
  avatarKey: text('avatar_key'),
  photoKey: text('photo_key'),
  hero: petHeroEnum('hero').notNull().default('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/** Who can see or edit a pet. The creator is the owner; others join by invite. */
export const petMembers = pgTable(
  'pet_members',
  {
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: petRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.petId, t.userId] }), index('pet_members_user_idx').on(t.userId)],
);

export type Pet = typeof pets.$inferSelect;
export type NewPet = typeof pets.$inferInsert;
export type PetMember = typeof petMembers.$inferSelect;
