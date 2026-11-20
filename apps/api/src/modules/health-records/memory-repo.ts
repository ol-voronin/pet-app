import type { ApiHealthRecord, HealthRecordSource, HealthRecordType } from '@pet-app/shared';
import {
  VersionConflict,
  type HealthRecordData,
  type HealthRecordRow,
  type HealthRecordsRepo,
  type HealthRecordVersionRow,
} from './types.js';

interface StoredRecord extends HealthRecordRow {
  deletedAt: Date | null;
}

/** In-memory HealthRecordsRepo for tests and the OpenAPI export. Not for production. */
export class MemoryHealthRecordsRepo implements HealthRecordsRepo {
  readonly records = new Map<string, StoredRecord>();
  readonly versions: HealthRecordVersionRow[] = [];

  create(input: {
    id: string;
    petId: string;
    type: HealthRecordType;
    source: HealthRecordSource;
    data: HealthRecordData;
    createdBy: string;
    now: Date;
  }) {
    const record: StoredRecord = {
      ...input.data,
      id: input.id,
      petId: input.petId,
      type: input.type,
      source: input.source,
      sourceDocumentId: null,
      version: 1,
      createdBy: input.createdBy,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    };
    this.records.set(record.id, record);
    return Promise.resolve(toRow(record));
  }

  listForPet(petId: string, filter: { type?: HealthRecordType }) {
    const rows = [...this.records.values()]
      .filter((r) => r.petId === petId && !r.deletedAt && (!filter.type || r.type === filter.type))
      .sort(
        (a, b) =>
          b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map(toRow);
    return Promise.resolve(rows);
  }

  get(petId: string, recordId: string): Promise<HealthRecordRow | null> {
    const record = this.records.get(recordId);
    if (!record || record.deletedAt || record.petId !== petId) return Promise.resolve(null);
    return Promise.resolve(toRow(record));
  }

  update(input: {
    recordId: string;
    expectedVersion: number;
    snapshotId: string;
    snapshot: ApiHealthRecord;
    data: HealthRecordData;
    changedBy: string;
    now: Date;
  }) {
    const record = this.records.get(input.recordId);
    if (!record || record.deletedAt || record.version !== input.expectedVersion) {
      return Promise.reject(new VersionConflict());
    }
    this.versions.push({
      id: input.snapshotId,
      healthRecordId: record.id,
      version: input.expectedVersion,
      snapshot: input.snapshot,
      changedBy: input.changedBy,
      changedAt: input.now,
    });
    const updated: StoredRecord = {
      ...record,
      ...input.data,
      version: input.expectedVersion + 1,
      updatedAt: input.now,
    };
    this.records.set(record.id, updated);
    return Promise.resolve(toRow(updated));
  }

  softDelete(recordId: string, now: Date) {
    const record = this.records.get(recordId);
    if (record && !record.deletedAt) {
      this.records.set(recordId, { ...record, deletedAt: now, updatedAt: now });
    }
    return Promise.resolve();
  }

  listVersions(recordId: string) {
    const rows = this.versions
      .filter((v) => v.healthRecordId === recordId)
      .sort((a, b) => b.version - a.version);
    return Promise.resolve(rows);
  }
}

function toRow({ deletedAt: _deletedAt, ...record }: StoredRecord): HealthRecordRow {
  return record;
}
