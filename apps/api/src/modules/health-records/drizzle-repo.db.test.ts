import { randomUUID } from 'node:crypto';
import { healthRecords } from '@pet-app/db';
import type { ApiHealthRecord } from '@pet-app/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { insertPet, insertUser, useTestDb } from '../../testing/db.js';
import { DrizzleHealthRecordsRepo } from './drizzle-repo.js';
import { VersionConflict, type HealthRecordData, type HealthRecordRow } from './types.js';

const db = useTestDb();
const repo = new DrizzleHealthRecordsRepo(db);

const now = new Date('2026-11-20T10:00:00.000Z');

const rabies: HealthRecordData = {
  date: new Date('2026-11-01T09:00:00.000Z'),
  title: 'Сказ',
  details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
  clinicName: 'Vet for pet',
  vetName: null,
  nextDueDate: new Date('2027-11-01T09:00:00.000Z'),
};

/** The record as the API would return it — what the service stores as a snapshot. */
const snapshotOf = (row: HealthRecordRow) =>
  ({
    id: row.id,
    petId: row.petId,
    type: row.type,
    date: row.date.toISOString(),
    title: row.title,
    details: row.details,
    source: row.source,
    version: row.version,
  }) as ApiHealthRecord;

async function setup() {
  const userId = await insertUser(db);
  const petId = await insertPet(db, userId);
  const create = (
    data: Partial<HealthRecordData> = {},
    type: 'vaccination' | 'note' = 'vaccination',
  ) =>
    repo.create({
      id: randomUUID(),
      petId,
      type,
      source: 'manual',
      data: { ...rabies, ...data },
      createdBy: userId,
      now,
    });
  const edit = (row: HealthRecordRow, data: Partial<HealthRecordData>, at = now) =>
    repo.update({
      recordId: row.id,
      expectedVersion: row.version,
      snapshotId: randomUUID(),
      snapshot: snapshotOf(row),
      data: { ...rabies, ...data },
      changedBy: userId,
      now: at,
    });
  return { userId, petId, create, edit };
}

describe('DrizzleHealthRecordsRepo on Postgres', () => {
  it('creates a record at version 1 and reads it back with dates and details intact', async () => {
    const { userId, petId, create } = await setup();

    const created = await create();

    expect(created).toMatchObject({
      ...rabies,
      petId,
      type: 'vaccination',
      source: 'manual',
      sourceDocumentId: null,
      version: 1,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    expect(await repo.get(petId, created.id)).toEqual(created);
    // A record is read only through its own pet.
    expect(await repo.get(randomUUID(), created.id)).toBeNull();
  });

  it('lists records of a pet newest date first and filters by type', async () => {
    const { petId, create } = await setup();
    const old = await create({ date: new Date('2025-05-01T00:00:00Z'), nextDueDate: null });
    const recent = await create({ date: new Date('2026-10-01T00:00:00Z'), nextDueDate: null });
    const note = await create(
      { date: new Date('2026-01-15T00:00:00Z'), details: { text: 'Кульгає' }, nextDueDate: null },
      'note',
    );

    expect((await repo.listForPet(petId, {})).map((r) => r.id)).toEqual([
      recent.id,
      note.id,
      old.id,
    ]);
    expect((await repo.listForPet(petId, { type: 'note' })).map((r) => r.id)).toEqual([note.id]);
  });

  it('saves the previous state as a version on every edit', async () => {
    const { userId, create, edit } = await setup();
    const v1 = await create();
    const later = new Date('2026-11-21T08:00:00.000Z');

    const v2 = await edit(v1, { title: 'Сказ (ревакцинація)' }, later);
    const v3 = await edit(v2, { clinicName: 'Shanty' }, later);

    expect(v2).toMatchObject({ version: 2, title: 'Сказ (ревакцинація)', updatedAt: later });
    expect(v3).toMatchObject({ version: 3, clinicName: 'Shanty' });
    const versions = await repo.listVersions(v1.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[1]).toMatchObject({
      healthRecordId: v1.id,
      changedBy: userId,
      changedAt: later,
      snapshot: { id: v1.id, title: 'Сказ', version: 1 },
    });
  });

  it('rejects an edit made from a stale version and leaves no history row behind', async () => {
    const { create, edit } = await setup();
    const v1 = await create();
    await edit(v1, { title: 'Перша правка' });

    await expect(edit(v1, { title: 'Друга правка' })).rejects.toBeInstanceOf(VersionConflict);

    expect((await repo.listVersions(v1.id)).map((v) => v.version)).toEqual([1]);
    expect((await repo.get(v1.petId, v1.id))?.title).toBe('Перша правка');
  });

  it('lets exactly one of two simultaneous edits of the same version through', async () => {
    const { create, edit } = await setup();
    for (let round = 0; round < 5; round += 1) {
      const v1 = await create();

      const results = await Promise.allSettled([
        edit(v1, { title: 'Марина' }),
        edit(v1, { title: 'Олег' }),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(lost[0]?.reason).toBeInstanceOf(VersionConflict);
      expect((await repo.get(v1.petId, v1.id))?.version).toBe(2);
      expect(await repo.listVersions(v1.id)).toHaveLength(1);
    }
  });

  it('soft-deletes: the record leaves the lists, the row and its history stay', async () => {
    const { petId, create, edit } = await setup();
    const v1 = await create();
    const v2 = await edit(v1, { title: 'Правка' });

    await repo.softDelete(v1.id, now);

    expect(await repo.get(petId, v1.id)).toBeNull();
    expect(await repo.listForPet(petId, {})).toEqual([]);
    await expect(edit(v2, { title: 'Після видалення' })).rejects.toBeInstanceOf(VersionConflict);
    expect(await repo.listVersions(v1.id)).toHaveLength(1);
    const [row] = await db.select().from(healthRecords).where(eq(healthRecords.id, v1.id));
    expect(row?.deletedAt).toEqual(now);
  });
});
