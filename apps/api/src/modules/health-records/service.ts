import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  parseHealthRecordDetails,
  type ApiHealthRecord,
  type ApiHealthRecordVersion,
  type CreateHealthRecordBody,
  type HealthRecordListQuery,
  type PetRole,
  type UpdateHealthRecordBody,
} from '@pet-app/shared';
import type { PetsRepo } from '../pets/types.js';
import { HealthRecordError } from './errors.js';
import {
  VersionConflict,
  type HealthRecordData,
  type HealthRecordRow,
  type HealthRecordsRepo,
} from './types.js';

export interface HealthRecordsServiceDeps {
  repo: HealthRecordsRepo;
  /** Who may see and change a pet is decided by `pet_members`, the same way as for the pet itself. */
  pets: Pick<PetsRepo, 'getForUser'>;
  clock?: () => Date;
}

const canEdit = (role: PetRole) => role === 'owner' || role === 'editor';

/**
 * Medical records of a pet. The history is free and complete for every member on every plan:
 * nothing here looks at a subscription, and nothing must (CLAUDE.md, domain rules).
 */
export class HealthRecordsService {
  private readonly repo: HealthRecordsRepo;
  private readonly pets: Pick<PetsRepo, 'getForUser'>;
  private readonly clock: () => Date;

  constructor(deps: HealthRecordsServiceDeps) {
    this.repo = deps.repo;
    this.pets = deps.pets;
    this.clock = deps.clock ?? (() => new Date());
  }

  async list(
    userId: string,
    petId: string,
    query: HealthRecordListQuery = {},
  ): Promise<ApiHealthRecord[]> {
    await this.role(userId, petId);
    const rows = await this.repo.listForPet(petId, query.type ? { type: query.type } : {});
    return rows.map(present);
  }

  async get(userId: string, petId: string, recordId: string): Promise<ApiHealthRecord> {
    await this.role(userId, petId);
    return present(await this.record(petId, recordId));
  }

  /** Manual entry: the server sets `source = manual`; the client cannot choose it. */
  async create(
    userId: string,
    petId: string,
    body: CreateHealthRecordBody,
  ): Promise<ApiHealthRecord> {
    await this.editable(userId, petId);
    const row = await this.repo.create({
      id: randomUUID(),
      petId,
      type: body.type,
      source: 'manual',
      data: {
        date: new Date(body.date),
        title: body.title ?? null,
        details: body.details,
        clinicName: body.clinicName ?? null,
        vetName: body.vetName ?? null,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
      },
      createdBy: userId,
      now: this.clock(),
    });
    return present(row);
  }

  /**
   * Every real change makes a new version: the record as it was goes to the history first.
   * An edit that changes nothing returns the record as is and adds no version.
   */
  async update(
    userId: string,
    petId: string,
    recordId: string,
    body: UpdateHealthRecordBody,
  ): Promise<ApiHealthRecord> {
    await this.editable(userId, petId);
    const current = await this.record(petId, recordId);

    let details = current.details;
    if (body.details !== undefined) {
      // The type of a record never changes, so `details` is checked against the stored type.
      const parsed = parseHealthRecordDetails(current.type, body.details);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.length ? `details.${issue.path.join('.')}: ` : 'details: ';
        throw new HealthRecordError('invalid_details', `${where}${issue?.message ?? 'invalid'}`);
      }
      details = parsed.data;
    }
    const next: HealthRecordData = {
      date: body.date !== undefined ? new Date(body.date) : current.date,
      title: body.title !== undefined ? body.title : current.title,
      details,
      clinicName: body.clinicName !== undefined ? body.clinicName : current.clinicName,
      vetName: body.vetName !== undefined ? body.vetName : current.vetName,
      nextDueDate:
        body.nextDueDate !== undefined
          ? body.nextDueDate === null
            ? null
            : new Date(body.nextDueDate)
          : current.nextDueDate,
    };
    // The body schema compares the two dates only when both are sent; here the stored one is known.
    if (next.nextDueDate && next.nextDueDate.getTime() < next.date.getTime()) {
      throw new HealthRecordError('next_due_before_date');
    }
    if (isDeepStrictEqual(next, editableOf(current))) return present(current);

    try {
      const updated = await this.repo.update({
        recordId,
        expectedVersion: current.version,
        snapshotId: randomUUID(),
        snapshot: present(current),
        data: next,
        changedBy: userId,
        now: this.clock(),
      });
      return present(updated);
    } catch (err) {
      // Someone else saved this record between our read and our write: the client reloads and retries.
      if (err instanceof VersionConflict) throw new HealthRecordError('version_conflict');
      throw err;
    }
  }

  /** Owner or editor. Soft delete: the record and its history stay in the database. */
  async remove(userId: string, petId: string, recordId: string): Promise<void> {
    await this.editable(userId, petId);
    const current = await this.record(petId, recordId);
    await this.repo.softDelete(current.id, this.clock());
  }

  /** Replaced versions, newest first. The current state is the record itself. */
  async versions(
    userId: string,
    petId: string,
    recordId: string,
  ): Promise<ApiHealthRecordVersion[]> {
    await this.role(userId, petId);
    const current = await this.record(petId, recordId);
    const rows = await this.repo.listVersions(current.id);
    return rows.map((v) => ({
      id: v.id,
      healthRecordId: v.healthRecordId,
      version: v.version,
      snapshot: v.snapshot,
      changedBy: v.changedBy,
      changedAt: v.changedAt.toISOString(),
    }));
  }

  /** A pet the user is not a member of looks like a missing pet: its existence is not revealed. */
  private async role(userId: string, petId: string): Promise<PetRole> {
    const access = await this.pets.getForUser(petId, userId);
    if (!access) throw new HealthRecordError('pet_not_found');
    return access.role;
  }

  private async editable(userId: string, petId: string): Promise<void> {
    if (!canEdit(await this.role(userId, petId))) throw new HealthRecordError('forbidden');
  }

  private async record(petId: string, recordId: string): Promise<HealthRecordRow> {
    const row = await this.repo.get(petId, recordId);
    if (!row) throw new HealthRecordError('health_record_not_found');
    return row;
  }
}

function editableOf(row: HealthRecordRow): HealthRecordData {
  return {
    date: row.date,
    title: row.title,
    details: row.details,
    clinicName: row.clinicName,
    vetName: row.vetName,
    nextDueDate: row.nextDueDate,
  };
}

/** Dates leave the API as UTC instants (`…Z`); the app shows them in `Europe/Kyiv`. */
function present(row: HealthRecordRow): ApiHealthRecord {
  return {
    id: row.id,
    petId: row.petId,
    date: row.date.toISOString(),
    title: row.title,
    source: row.source,
    sourceDocumentId: row.sourceDocumentId,
    clinicName: row.clinicName,
    vetName: row.vetName,
    nextDueDate: row.nextDueDate ? row.nextDueDate.toISOString() : null,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // `details` was validated against `type` when it was written; the response schema checks it again.
    type: row.type,
    details: row.details,
  } as ApiHealthRecord;
}
