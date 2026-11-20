import type { ApiHealthRecord, HealthRecordSource, HealthRecordType } from '@pet-app/shared';

/** Fields a member with write access can change. `null` means "not filled in". */
export interface HealthRecordData {
  /** When it happened (UTC). */
  date: Date;
  title: string | null;
  /** Shape depends on the record type; validated by the shared zod schemas before it gets here. */
  details: Record<string, unknown>;
  clinicName: string | null;
  vetName: string | null;
  nextDueDate: Date | null;
}

export interface HealthRecordRow extends HealthRecordData {
  id: string;
  petId: string;
  type: HealthRecordType;
  source: HealthRecordSource;
  sourceDocumentId: string | null;
  /** Starts at 1, grows by one with every edit. */
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthRecordVersionRow {
  id: string;
  healthRecordId: string;
  /** The version the snapshot holds: the record's version before the edit. */
  version: number;
  /** The record as the API returned it before the edit. */
  snapshot: ApiHealthRecord;
  changedBy: string | null;
  changedAt: Date;
}

/** Thrown by a repo when the record changed (or was deleted) between the read and the write. */
export class VersionConflict extends Error {
  constructor() {
    super('version_conflict');
  }
}

/** Storage port for medical records. Drizzle implementation in production, in-memory in tests. */
export interface HealthRecordsRepo {
  create(input: {
    id: string;
    petId: string;
    type: HealthRecordType;
    source: HealthRecordSource;
    data: HealthRecordData;
    createdBy: string;
    now: Date;
  }): Promise<HealthRecordRow>;
  /** Records of the pet that are not deleted, newest `date` first. */
  listForPet(petId: string, filter: { type?: HealthRecordType }): Promise<HealthRecordRow[]>;
  /** A record of this pet that is not deleted, or null. */
  get(petId: string, recordId: string): Promise<HealthRecordRow | null>;
  /**
   * Saves `snapshot` as version `expectedVersion` and writes the new data as `expectedVersion + 1`,
   * both or neither. Throws `VersionConflict` when the stored version is no longer `expectedVersion`.
   */
  update(input: {
    recordId: string;
    expectedVersion: number;
    snapshotId: string;
    snapshot: ApiHealthRecord;
    data: HealthRecordData;
    changedBy: string;
    now: Date;
  }): Promise<HealthRecordRow>;
  /** Soft delete: medical data is never removed physically (docs/DATA_MODEL.md). */
  softDelete(recordId: string, now: Date): Promise<void>;
  /** Replaced versions of the record, newest first. */
  listVersions(recordId: string): Promise<HealthRecordVersionRow[]>;
}
