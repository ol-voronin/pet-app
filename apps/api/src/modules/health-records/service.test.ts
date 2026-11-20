import {
  healthRecordSchema,
  healthRecordVersionSchema,
  type CreateHealthRecordBody,
} from '@pet-app/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPetsRepo } from '../pets/memory-repo.js';
import { PetsService } from '../pets/service.js';
import { MemoryHealthRecordsRepo } from './memory-repo.js';
import { HealthRecordsService } from './service.js';

const owner = '11111111-1111-4111-8111-111111111111';
const editor = '22222222-2222-4222-8222-222222222222';
const viewer = '33333333-3333-4333-8333-333333333333';
const stranger = '44444444-4444-4444-8444-444444444444';
const missing = '99999999-9999-4999-8999-999999999999';

const rabies: CreateHealthRecordBody = {
  type: 'vaccination',
  date: '2026-10-01T09:00:00Z',
  title: 'Сказ',
  details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
  clinicName: 'Vet for pet',
  nextDueDate: '2027-10-01T09:00:00Z',
};

describe('HealthRecordsService', () => {
  let petsRepo: MemoryPetsRepo;
  let repo: MemoryHealthRecordsRepo;
  let pets: PetsService;
  let service: HealthRecordsService;
  let now: Date;

  beforeEach(() => {
    petsRepo = new MemoryPetsRepo();
    repo = new MemoryHealthRecordsRepo();
    now = new Date('2026-11-21T10:00:00Z');
    pets = new PetsService({ repo: petsRepo, storage: null, clock: () => now });
    service = new HealthRecordsService({ repo, pets: petsRepo, clock: () => now });
  });

  const tick = (ms = 60_000) => {
    now = new Date(now.getTime() + ms);
  };

  async function sharedPet(name = 'Бадді', species: 'dog' | 'cat' = 'dog') {
    const pet = await pets.create(owner, { name, species });
    petsRepo.addMember(pet.id, editor, 'editor');
    petsRepo.addMember(pet.id, viewer, 'viewer');
    return pet;
  }

  describe('create', () => {
    it('saves a manual record as version 1 with the author and UTC dates', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      expect(healthRecordSchema.safeParse(record).success).toBe(true);
      expect(record).toMatchObject({
        petId: pet.id,
        type: 'vaccination',
        title: 'Сказ',
        details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
        source: 'manual',
        sourceDocumentId: null,
        clinicName: 'Vet for pet',
        vetName: null,
        version: 1,
        createdBy: owner,
        date: '2026-10-01T09:00:00.000Z',
        nextDueDate: '2027-10-01T09:00:00.000Z',
        createdAt: '2026-11-21T10:00:00.000Z',
        updatedAt: '2026-11-21T10:00:00.000Z',
      });
    });

    it('a weight or a note needs no title, clinic or next date', async () => {
      const pet = await sharedPet();
      const weight = await service.create(editor, pet.id, {
        type: 'weight',
        date: '2026-11-20T07:30:00Z',
        details: { valueKg: 31.4 },
      });
      expect(weight).toMatchObject({
        title: null,
        clinicName: null,
        nextDueDate: null,
        createdBy: editor,
      });
    });

    it('keeps the instant: an evening in Kyiv that is already the next day in UTC', async () => {
      const pet = await sharedPet();
      // 01:30 on 2 July in Kyiv (UTC+3) is 22:30 on 1 July in UTC.
      const record = await service.create(owner, pet.id, {
        type: 'note',
        date: '2026-07-01T22:30:00Z',
        details: { text: 'Нічний візит' },
      });
      expect(record.date).toBe('2026-07-01T22:30:00.000Z');
      expect(repo.records.get(record.id)?.date.getTime()).toBe(Date.UTC(2026, 6, 1, 22, 30));
    });
  });

  describe('access', () => {
    it('owner and editor write, viewer only reads, a stranger sees no pet at all', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      const patch = { title: 'Сказ (ревакцинація)' };

      // viewer: reads everything, changes nothing
      await expect(service.list(viewer, pet.id)).resolves.toHaveLength(1);
      await expect(service.get(viewer, pet.id, record.id)).resolves.toMatchObject({
        id: record.id,
      });
      await expect(service.versions(viewer, pet.id, record.id)).resolves.toEqual([]);
      await expect(service.create(viewer, pet.id, rabies)).rejects.toMatchObject({
        code: 'forbidden',
        statusCode: 403,
      });
      await expect(service.update(viewer, pet.id, record.id, patch)).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(service.remove(viewer, pet.id, record.id)).rejects.toMatchObject({
        code: 'forbidden',
      });

      // stranger: the pet does not exist for them, on every operation
      const notFound = { code: 'pet_not_found', statusCode: 404 };
      await expect(service.list(stranger, pet.id)).rejects.toMatchObject(notFound);
      await expect(service.get(stranger, pet.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.versions(stranger, pet.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.create(stranger, pet.id, rabies)).rejects.toMatchObject(notFound);
      await expect(service.update(stranger, pet.id, record.id, patch)).rejects.toMatchObject(
        notFound,
      );
      await expect(service.remove(stranger, pet.id, record.id)).rejects.toMatchObject(notFound);

      // nothing changed after all the refused attempts
      expect(await service.get(owner, pet.id, record.id)).toEqual(record);

      // editor: full write access
      tick();
      const edited = await service.update(editor, pet.id, record.id, patch);
      expect(edited).toMatchObject({ title: patch.title, version: 2, createdBy: owner });
      const own = await service.create(editor, pet.id, rabies);
      await service.remove(editor, pet.id, own.id);
      await service.remove(owner, pet.id, record.id);
      await expect(service.list(viewer, pet.id)).resolves.toEqual([]);
    });

    it('a member who lost access stops seeing the records', async () => {
      const pet = await sharedPet();
      await service.create(owner, pet.id, rabies);
      petsRepo.members.get(pet.id)?.delete(viewer);
      await expect(service.list(viewer, pet.id)).rejects.toMatchObject({ code: 'pet_not_found' });
    });

    it('a deleted pet has no reachable records', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      await pets.remove(owner, pet.id);
      await expect(service.list(owner, pet.id)).rejects.toMatchObject({ code: 'pet_not_found' });
      await expect(service.get(owner, pet.id, record.id)).rejects.toMatchObject({
        code: 'pet_not_found',
      });
      // soft delete of the pet keeps the medical data
      expect(repo.records.has(record.id)).toBe(true);
    });

    it("a record is reachable only through its own pet, even for both pets' owner", async () => {
      const dog = await sharedPet('Бадді', 'dog');
      const cat = await pets.create(owner, { name: 'Манго', species: 'cat' });
      const record = await service.create(owner, dog.id, rabies);
      const notFound = { code: 'health_record_not_found', statusCode: 404 };
      await expect(service.get(owner, cat.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.update(owner, cat.id, record.id, { title: 'x' })).rejects.toMatchObject(
        notFound,
      );
      await expect(service.remove(owner, cat.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.versions(owner, cat.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.get(owner, dog.id, missing)).rejects.toMatchObject(notFound);
    });

    it('an editor of one pet cannot reach a record of a pet they are not in', async () => {
      const dog = await sharedPet('Бадді', 'dog');
      const cat = await pets.create(owner, { name: 'Дим', species: 'cat' });
      const catRecord = await service.create(owner, cat.id, rabies);
      // through the cat: no pet; through the dog they do edit: no such record
      await expect(service.get(editor, cat.id, catRecord.id)).rejects.toMatchObject({
        code: 'pet_not_found',
      });
      await expect(
        service.update(editor, dog.id, catRecord.id, { title: 'x' }),
      ).rejects.toMatchObject({ code: 'health_record_not_found' });
      expect(repo.records.get(catRecord.id)?.title).toBe('Сказ');
    });
  });

  describe('list', () => {
    it('returns the newest first and filters by type', async () => {
      const pet = await sharedPet();
      const old = await service.create(owner, pet.id, {
        type: 'weight',
        date: '2025-01-10T08:00:00Z',
        details: { valueKg: 28 },
      });
      const recent = await service.create(owner, pet.id, {
        type: 'weight',
        date: '2026-11-20T08:00:00Z',
        details: { valueKg: 31.4 },
      });
      const vaccine = await service.create(owner, pet.id, rabies);

      expect((await service.list(viewer, pet.id)).map((r) => r.id)).toEqual([
        recent.id,
        vaccine.id,
        old.id,
      ]);
      expect((await service.list(viewer, pet.id, { type: 'weight' })).map((r) => r.id)).toEqual([
        recent.id,
        old.id,
      ]);
      expect(await service.list(viewer, pet.id, { type: 'lab' })).toEqual([]);
    });

    it('two records of the same moment: the one entered later comes first', async () => {
      const pet = await sharedPet();
      const first = await service.create(owner, pet.id, rabies);
      tick();
      const second = await service.create(owner, pet.id, { ...rabies, title: 'Комплексна' });
      expect((await service.list(owner, pet.id)).map((r) => r.id)).toEqual([second.id, first.id]);
    });

    it('never cuts the history: years of records come back whole (history is free forever)', async () => {
      const pet = await sharedPet();
      for (let i = 0; i < 150; i++) {
        await service.create(owner, pet.id, {
          type: 'weight',
          date: new Date(Date.UTC(2015, 0, 1 + i * 28)).toISOString(),
          details: { valueKg: 20 + i / 10 },
        });
      }
      const all = await service.list(viewer, pet.id);
      expect(all).toHaveLength(150);
      expect(all.at(-1)?.date).toBe('2015-01-01T00:00:00.000Z');
    });
  });

  describe('update and versions', () => {
    it('every edit adds a version and keeps the record as it was, with who changed it', async () => {
      const pet = await sharedPet();
      const v1 = await service.create(owner, pet.id, rabies);

      tick();
      const firstEditAt = now.toISOString();
      const v2 = await service.update(editor, pet.id, v1.id, {
        title: 'Сказ (ревакцинація)',
        vetName: 'Олена Коваль',
      });
      expect(v2).toMatchObject({
        id: v1.id,
        version: 2,
        title: 'Сказ (ревакцинація)',
        vetName: 'Олена Коваль',
        clinicName: 'Vet for pet',
        createdBy: owner,
        createdAt: v1.createdAt,
        updatedAt: firstEditAt,
      });

      tick();
      const v3 = await service.update(owner, pet.id, v1.id, {
        details: { vaccineName: 'Rabisin', batch: 'L4821' },
        clinicName: null,
      });
      expect(v3).toMatchObject({
        version: 3,
        details: { vaccineName: 'Rabisin', batch: 'L4821', against: [] },
        clinicName: null,
        title: 'Сказ (ревакцинація)',
      });

      const versions = await service.versions(viewer, pet.id, v1.id);
      expect(versions.map((v) => v.version)).toEqual([2, 1]);
      expect(versions[1]).toMatchObject({
        healthRecordId: v1.id,
        version: 1,
        snapshot: v1,
        changedBy: editor,
        changedAt: firstEditAt,
      });
      expect(versions[0]).toMatchObject({ version: 2, snapshot: v2, changedBy: owner });
      for (const v of versions) expect(healthRecordVersionSchema.safeParse(v).success).toBe(true);
      // the current state is the record itself
      expect(await service.get(viewer, pet.id, v1.id)).toEqual(v3);
    });

    it('an edit that changes nothing adds no version', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      tick();
      expect(await service.update(owner, pet.id, record.id, {})).toEqual(record);
      expect(
        await service.update(editor, pet.id, record.id, {
          title: 'Сказ',
          date: '2026-10-01T09:00:00.000Z',
          // same content, different key order
          details: { against: ['rabies'], vaccineName: 'Nobivac Rabies' },
        }),
      ).toEqual(record);
      expect(await service.versions(owner, pet.id, record.id)).toEqual([]);
    });

    it('checks new details against the stored type, which never changes', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      await expect(
        service.update(owner, pet.id, record.id, { details: { valueKg: 12 } }),
      ).rejects.toMatchObject({
        code: 'invalid_details',
        statusCode: 400,
        detail: expect.stringContaining('details.vaccineName') as string,
      });
      await expect(service.update(owner, pet.id, record.id, { details: {} })).rejects.toMatchObject(
        { code: 'invalid_details' },
      );
      expect(await service.get(owner, pet.id, record.id)).toEqual(record);
      expect(repo.versions).toHaveLength(0);
    });

    it('the next due date cannot end up before the record date, whichever of the two is sent', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      const bad = { code: 'next_due_before_date', statusCode: 400 };
      await expect(
        service.update(owner, pet.id, record.id, { nextDueDate: '2026-09-30T09:00:00Z' }),
      ).rejects.toMatchObject(bad);
      await expect(
        service.update(owner, pet.id, record.id, { date: '2027-10-02T09:00:00Z' }),
      ).rejects.toMatchObject(bad);
      // clearing it or moving both is fine
      tick();
      const cleared = await service.update(owner, pet.id, record.id, { nextDueDate: null });
      expect(cleared).toMatchObject({ nextDueDate: null, version: 2 });
      tick();
      const moved = await service.update(owner, pet.id, record.id, {
        date: '2027-10-02T09:00:00Z',
      });
      expect(moved).toMatchObject({ date: '2027-10-02T09:00:00.000Z', version: 3 });
    });

    it('two edits made from the same version: the second gets a conflict and changes nothing', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      // Both adults opened version 1. The editor's read is served before the owner's save lands.
      const realGet = repo.get.bind(repo);
      let hold = true;
      repo.get = async (petId, recordId) => {
        const row = await realGet(petId, recordId);
        if (hold) {
          hold = false;
          await service.update(owner, pet.id, record.id, { title: 'Власник' });
        }
        return row;
      };
      await expect(
        service.update(editor, pet.id, record.id, { title: 'Редактор' }),
      ).rejects.toMatchObject({ code: 'version_conflict', statusCode: 409 });
      repo.get = realGet;

      expect(await service.get(viewer, pet.id, record.id)).toMatchObject({
        title: 'Власник',
        version: 2,
      });
      expect((await service.versions(viewer, pet.id, record.id)).map((v) => v.version)).toEqual([
        1,
      ]);
    });

    it('a deleted record cannot be edited and is gone from the list, but stays stored', async () => {
      const pet = await sharedPet();
      const record = await service.create(owner, pet.id, rabies);
      tick();
      await service.update(owner, pet.id, record.id, { title: 'Сказ 2' });
      tick();
      await service.remove(editor, pet.id, record.id);

      const notFound = { code: 'health_record_not_found' };
      await expect(service.get(owner, pet.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.update(owner, pet.id, record.id, { title: 'x' })).rejects.toMatchObject(
        notFound,
      );
      await expect(service.remove(owner, pet.id, record.id)).rejects.toMatchObject(notFound);
      await expect(service.versions(owner, pet.id, record.id)).rejects.toMatchObject(notFound);
      expect(await service.list(owner, pet.id)).toEqual([]);
      // nothing medical is erased: the row and its history are still there
      expect(repo.records.get(record.id)).toMatchObject({ title: 'Сказ 2', deletedAt: now });
      expect(repo.versions).toHaveLength(1);
    });
  });

  it('family scenario: Бадді, Манго and Дим, the second adult is a viewer', async () => {
    const marina = owner;
    const andriy = viewer;
    const buddy = await pets.create(marina, { name: 'Бадді', species: 'dog' });
    const mango = await pets.create(marina, { name: 'Манго', species: 'cat' });
    const dym = await pets.create(marina, { name: 'Дим', species: 'cat' });
    for (const pet of [buddy, mango, dym]) petsRepo.addMember(pet.id, andriy, 'viewer');

    const buddyRabies = await service.create(marina, buddy.id, rabies);
    await service.create(marina, buddy.id, {
      type: 'treatment',
      date: '2026-08-01T07:00:00Z',
      details: { kind: 'flea_tick', product: 'Bravecto' },
      // overdue on 21.11.2026 — the one overdue thing of the scenario
      nextDueDate: '2026-11-01T07:00:00Z',
    });
    await service.create(marina, mango.id, {
      type: 'weight',
      date: '2026-11-15T08:00:00Z',
      details: { valueKg: 4.2 },
    });
    await service.create(marina, dym.id, {
      type: 'visit',
      date: '2026-09-12T13:00:00Z',
      clinicName: 'Shanty',
      details: { reason: 'Кашель', recommendations: 'Контроль через тиждень' },
    });

    // each pet has its own history; the second adult sees all three
    const [buddyList, mangoList, dymList] = await Promise.all(
      [buddy, mango, dym].map((pet) => service.list(andriy, pet.id)),
    );
    expect(buddyList?.map((r) => r.type)).toEqual(['vaccination', 'treatment']);
    expect(mangoList?.map((r) => r.type)).toEqual(['weight']);
    expect(dymList?.map((r) => r.type)).toEqual(['visit']);
    expect(buddyList?.every((r) => r.petId === buddy.id && r.createdBy === marina)).toBe(true);
    expect(buddyList?.[1]?.nextDueDate).toBe('2026-11-01T07:00:00.000Z');

    // …and can change none of them
    const forbidden = { code: 'forbidden' };
    for (const pet of [buddy, mango, dym]) {
      await expect(
        service.create(andriy, pet.id, {
          type: 'note',
          date: '2026-11-21T09:00:00Z',
          details: { text: 'x' },
        }),
      ).rejects.toMatchObject(forbidden);
    }
    await expect(
      service.update(andriy, buddy.id, buddyRabies.id, { title: 'x' }),
    ).rejects.toMatchObject(forbidden);
    await expect(service.remove(andriy, buddy.id, buddyRabies.id)).rejects.toMatchObject(forbidden);

    // promoted to editor for Бадді only: writes there, still read-only for the cats
    petsRepo.addMember(buddy.id, andriy, 'editor');
    tick();
    const edited = await service.update(andriy, buddy.id, buddyRabies.id, {
      vetName: 'Олена Коваль',
    });
    expect(edited).toMatchObject({ version: 2, vetName: 'Олена Коваль', createdBy: marina });
    expect((await service.versions(marina, buddy.id, buddyRabies.id))[0]).toMatchObject({
      version: 1,
      changedBy: andriy,
    });
    await expect(
      service.create(andriy, mango.id, {
        type: 'weight',
        date: '2026-11-21T09:00:00Z',
        details: { valueKg: 4.3 },
      }),
    ).rejects.toMatchObject(forbidden);
  });
});
