import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { pets } from './pets.js';
import { users } from './users.js';

export const healthRecordTypeEnum = pgEnum('health_record_type', [
  'vaccination',
  'treatment',
  'visit',
  'lab',
  'medication',
  'note',
  'weight',
]);
/** Where a record came from. An `ocr` record is created only after the user confirms it. */
export const healthRecordSourceEnum = pgEnum('health_record_source', ['manual', 'ocr', 'clinic']);

/**
 * One table for every kind of medical record. Fields that depend on `type` live in `details`;
 * their shape is validated by the zod schemas in `@pet-app/shared` (health-records).
 * Nothing medical is deleted physically: `deleted_at` hides a record, history stays.
 */
export const healthRecords = pgTable(
  'health_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    type: healthRecordTypeEnum('type').notNull(),
    /** When it happened (UTC), not when it was entered. */
    date: timestamp('date', { withTimezone: true }).notNull(),
    /** Optional: a weight or a note needs no title. */
    title: text('title'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    source: healthRecordSourceEnum('source').notNull().default('manual'),
    /** The scanned or uploaded document. The foreign key arrives with the `documents` table. */
    sourceDocumentId: uuid('source_document_id'),
    clinicName: text('clinic_name'),
    vetName: text('vet_name'),
    nextDueDate: timestamp('next_due_date', { withTimezone: true }),
    /** Starts at 1; every edit adds one and saves the previous state to `health_record_versions`. */
    version: integer('version').notNull().default(1),
    /** Kept when the author's account is deleted: the record belongs to the pet. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('health_records_pet_date_idx').on(t.petId, t.date),
    check('health_records_version_check', sql`${t.version} >= 1`),
    check(
      'health_records_ocr_document_check',
      sql`${t.source} <> 'ocr' OR ${t.sourceDocumentId} IS NOT NULL`,
    ),
  ],
);

/** History of edits: the whole record as it was before the change, one row per replaced version. */
export const healthRecordVersions = pgTable(
  'health_record_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    healthRecordId: uuid('health_record_id')
      .notNull()
      .references(() => healthRecords.id, { onDelete: 'cascade' }),
    /** The version this snapshot holds, i.e. the record's `version` before the edit. */
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('health_record_versions_record_version_unique').on(t.healthRecordId, t.version),
    check('health_record_versions_version_check', sql`${t.version} >= 1`),
  ],
);

export type HealthRecord = typeof healthRecords.$inferSelect;
export type NewHealthRecord = typeof healthRecords.$inferInsert;
export type HealthRecordVersion = typeof healthRecordVersions.$inferSelect;
export type NewHealthRecordVersion = typeof healthRecordVersions.$inferInsert;
