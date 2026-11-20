import {
  healthRecords,
  healthRecordVersions,
  type Db,
  type HealthRecord,
  type HealthRecordVersion,
} from '@pet-app/db';
import type { ApiHealthRecord, HealthRecordSource, HealthRecordType } from '@pet-app/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  VersionConflict,
  type HealthRecordData,
  type HealthRecordRow,
  type HealthRecordsRepo,
  type HealthRecordVersionRow,
} from './types.js';

const toRow = (r: HealthRecord): HealthRecordRow => ({
  id: r.id,
  petId: r.petId,
  type: r.type,
  date: r.date,
  title: r.title,
  details: r.details,
  source: r.source,
  sourceDocumentId: r.sourceDocumentId,
  clinicName: r.clinicName,
  vetName: r.vetName,
  nextDueDate: r.nextDueDate,
  version: r.version,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toVersionRow = (v: HealthRecordVersion): HealthRecordVersionRow => ({
  id: v.id,
  healthRecordId: v.healthRecordId,
  version: v.version,
  // Written by this repo from an `ApiHealthRecord`; nothing else writes snapshots.
  snapshot: v.snapshot as ApiHealthRecord,
  changedBy: v.changedBy,
  changedAt: v.changedAt,
});

const UNIQUE_VIOLATION = '23505';

/** Postgres error code, whether the driver error comes bare or wrapped by drizzle (`cause`). */
export function pgErrorCode(err: unknown): string | undefined {
  for (let e = err, depth = 0; e instanceof Error && depth < 4; e = e.cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Postgres (Neon) implementation of HealthRecordsRepo. */
export class DrizzleHealthRecordsRepo implements HealthRecordsRepo {
  constructor(private readonly db: Db) {}

  async create(input: {
    id: string;
    petId: string;
    type: HealthRecordType;
    source: HealthRecordSource;
    data: HealthRecordData;
    createdBy: string;
    now: Date;
  }) {
    const [row] = await this.db
      .insert(healthRecords)
      .values({
        ...input.data,
        id: input.id,
        petId: input.petId,
        type: input.type,
        source: input.source,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!row) throw new Error('insert health_records returned no row');
    return toRow(row);
  }

  async listForPet(petId: string, filter: { type?: HealthRecordType }) {
    const rows = await this.db
      .select()
      .from(healthRecords)
      .where(
        and(
          eq(healthRecords.petId, petId),
          isNull(healthRecords.deletedAt),
          filter.type ? eq(healthRecords.type, filter.type) : undefined,
        ),
      )
      .orderBy(desc(healthRecords.date), desc(healthRecords.createdAt));
    return rows.map(toRow);
  }

  async get(petId: string, recordId: string) {
    const [row] = await this.db
      .select()
      .from(healthRecords)
      .where(
        and(
          eq(healthRecords.id, recordId),
          eq(healthRecords.petId, petId),
          isNull(healthRecords.deletedAt),
        ),
      );
    return row ? toRow(row) : null;
  }

  async update(input: {
    recordId: string;
    expectedVersion: number;
    snapshotId: string;
    snapshot: ApiHealthRecord;
    data: HealthRecordData;
    changedBy: string;
    now: Date;
  }) {
    // neon-http has no interactive transactions; a batch runs both statements in one transaction.
    // The snapshot is saved only while the record is still at the version we read, so an edit of a
    // record deleted meanwhile leaves no stray history row. Two edits made from the same version
    // both try to save snapshot N: the unique constraint (health_record_id, version) fails the
    // second one and its whole batch rolls back.
    const unchanged = and(
      eq(healthRecords.id, input.recordId),
      eq(healthRecords.version, input.expectedVersion),
      isNull(healthRecords.deletedAt),
    );
    let rows: HealthRecord[];
    try {
      [, rows] = await this.db.batch([
        this.db.execute(sql`
          insert into ${healthRecordVersions} (id, health_record_id, version, snapshot, changed_by, changed_at)
          select ${input.snapshotId}::uuid, ${healthRecords.id}, ${healthRecords.version},
            ${JSON.stringify(input.snapshot)}::jsonb, ${input.changedBy}::uuid,
            ${input.now.toISOString()}::timestamptz
          from ${healthRecords}
          where ${unchanged}`),
        this.db
          .update(healthRecords)
          .set({ ...input.data, version: input.expectedVersion + 1, updatedAt: input.now })
          .where(unchanged)
          .returning(),
      ]);
    } catch (err) {
      if (pgErrorCode(err) === UNIQUE_VIOLATION) throw new VersionConflict();
      throw err;
    }
    const row = rows[0];
    // The record was deleted between the read and the write.
    if (!row) throw new VersionConflict();
    return toRow(row);
  }

  async softDelete(recordId: string, now: Date) {
    await this.db
      .update(healthRecords)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(healthRecords.id, recordId), isNull(healthRecords.deletedAt)));
  }

  async listVersions(recordId: string) {
    const rows = await this.db
      .select()
      .from(healthRecordVersions)
      .where(eq(healthRecordVersions.healthRecordId, recordId))
      .orderBy(desc(healthRecordVersions.version));
    return rows.map(toVersionRow);
  }
}
