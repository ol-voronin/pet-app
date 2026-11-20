import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pets } from './pets.js';
import { users } from './users.js';

export const documentKindEnum = pgEnum('document_kind', ['scan', 'file']);
export const documentStatusEnum = pgEnum('document_status', [
  'stored',
  'uploaded',
  'processing',
  'needs_review',
  'confirmed',
  'failed',
]);

/** Pet documents: uploaded files (`kind = file`, `status = stored`) and future OCR scans. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    /** Object key in the private bucket (ADR-0006). Signed URLs are generated on read, never stored. */
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    pages: integer('pages'),
    kind: documentKindEnum('kind').notNull().default('file'),
    status: documentStatusEnum('status').notNull().default('stored'),
    docType: text('doc_type'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    rawExtraction: jsonb('raw_extraction'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('documents_pet_idx').on(t.petId, t.createdAt)],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
