import { MAX_FILE_BYTES, type ApiPet, type CreatePetBody, type PetRole } from '@pet-app/shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../shared/api/http';
import { kyivToday, petAge } from './age';
import type { PetsApi } from './api';
import {
  emptyPetForm,
  formatDisplayDate,
  parseDisplayDate,
  petSaveErrorKey,
  petToForm,
  validatePetForm,
  type PetFormValues,
} from './form';
import { petPermissions } from './permissions';
import { PhotoRejectedError, photoErrorKey, uploadPetPhoto, type PickedPhoto } from './photo';
import {
  attachPhoto,
  createPetMutation,
  deletePetMutation,
  petKeys,
  petQuery,
  petsListQuery,
  updatePetMutation,
  uploadPetPhotoMutation,
} from './queries';

/** The household from CLAUDE.md rule 9: a dog and two cats. */
function pet(name: string, species: ApiPet['species'], role: PetRole = 'owner'): ApiPet {
  return {
    id: `00000000-0000-4000-8000-${String(name.length).padStart(12, '0')}`,
    name,
    species,
    breed: null,
    sex: null,
    birthDate: null,
    color: null,
    sterilized: null,
    chipNumber: null,
    registryNumber: null,
    tagNumber: null,
    notes: null,
    hero: 'avatar',
    photoUrl: null,
    role,
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
  };
}
const buddy = { ...pet('Бадді', 'dog'), id: '11111111-1111-4111-8111-111111111111' };
const mango = { ...pet('Манго', 'cat'), id: '22222222-2222-4222-8222-222222222222' };
const dym = { ...pet('Дим', 'cat'), id: '33333333-3333-4333-8333-333333333333' };

class FakePetsApi implements PetsApi {
  pets: ApiPet[] = [buddy, mango, dym];
  calls: string[] = [];
  photoError: Error | null = null;

  list = () => {
    this.calls.push('list');
    return Promise.resolve(this.pets);
  };
  get = (petId: string) => {
    const found = this.pets.find((p) => p.id === petId);
    return found ? Promise.resolve(found) : Promise.reject(new ApiError(404, 'pet_not_found'));
  };
  create = (body: CreatePetBody) => {
    const created: ApiPet = {
      ...pet(body.name, body.species),
      id: '44444444-4444-4444-8444-444444444444',
      breed: body.breed ?? null,
      birthDate: body.birthDate ?? null,
    };
    this.pets = [...this.pets, created];
    return Promise.resolve(created);
  };
  update = (petId: string, body: object) => {
    const current = this.pets.find((p) => p.id === petId);
    if (!current) return Promise.reject(new ApiError(404, 'pet_not_found'));
    const updated = { ...current, ...body };
    this.pets = this.pets.map((p) => (p.id === petId ? updated : p));
    return Promise.resolve(updated);
  };
  remove = (petId: string) => {
    this.pets = this.pets.filter((p) => p.id !== petId);
    return Promise.resolve();
  };
  startPhotoUpload = (petId: string) => {
    this.calls.push('startPhotoUpload');
    if (this.photoError) return Promise.reject(this.photoError);
    return Promise.resolve({
      key: `pets/${petId}/photo/file.jpg`,
      upload: {
        url: 'https://storage.example.test/upload',
        method: 'PUT' as const,
        headers: { 'content-type': 'image/jpeg' },
        expiresAt: '2026-11-19T10:10:00.000Z',
      },
    });
  };
  setPhoto = (petId: string, key: string) => {
    this.calls.push(`setPhoto:${key}`);
    return this.update(petId, { hero: 'photo', photoUrl: 'https://storage.example.test/photo' });
  };
  removePhoto = (petId: string) => this.update(petId, { hero: 'avatar', photoUrl: null });
}

describe('pet form validation', () => {
  const filled: PetFormValues = {
    name: '  Бадді ',
    species: 'dog',
    breed: 'Лабрадор',
    sex: 'male',
    birthDate: '01.05.2020',
    chipNumber: '900 123 456 789 012',
  };

  it('accepts name and species only — the manual onboarding path', () => {
    const result = validatePetForm({ ...emptyPetForm, name: 'Манго', species: 'cat' });
    expect(result).toEqual({
      ok: true,
      body: {
        name: 'Манго',
        species: 'cat',
        breed: null,
        sex: null,
        birthDate: null,
        chipNumber: null,
      },
    });
  });

  it('builds the request body: trims text, converts the date, removes spaces from the chip', () => {
    const result = validatePetForm(filled);
    expect(result).toEqual({
      ok: true,
      body: {
        name: 'Бадді',
        species: 'dog',
        breed: 'Лабрадор',
        sex: 'male',
        birthDate: '2020-05-01',
        chipNumber: '900123456789012',
      },
    });
  });

  it('requires a name and a species', () => {
    expect(validatePetForm(emptyPetForm)).toEqual({
      ok: false,
      errors: { name: 'pets.form.errors.name', species: 'pets.form.errors.species' },
    });
    expect(validatePetForm({ ...filled, name: '   ' })).toMatchObject({
      ok: false,
      errors: { name: 'pets.form.errors.name' },
    });
  });

  it('rejects a date that is not a real date or is in the future', () => {
    for (const birthDate of ['30.02.2020', 'вчора', '2020-05-01', '1.13.2020']) {
      expect(validatePetForm({ ...filled, birthDate }), birthDate).toMatchObject({
        ok: false,
        errors: { birthDate: 'pets.form.errors.birthDate' },
      });
    }
    expect(validatePetForm({ ...filled, birthDate: '01.01.2999' })).toMatchObject({
      ok: false,
      errors: { birthDate: 'pets.form.errors.birthDateFuture' },
    });
    // A typo in the year (QA #49).
    expect(validatePetForm({ ...filled, birthDate: '01.05.1020' })).toMatchObject({
      ok: false,
      errors: { birthDate: 'pets.form.errors.birthDateTooOld' },
    });
  });

  it('limits the length of text fields like the API does', () => {
    expect(validatePetForm({ ...filled, name: 'я'.repeat(61) })).toMatchObject({
      errors: { name: 'pets.form.errors.nameTooLong' },
    });
    expect(validatePetForm({ ...filled, breed: 'я'.repeat(81) })).toMatchObject({
      errors: { breed: 'pets.form.errors.breedTooLong' },
    });
    expect(validatePetForm({ ...filled, chipNumber: '1'.repeat(33) })).toMatchObject({
      errors: { chipNumber: 'pets.form.errors.chipTooLong' },
    });
  });

  it('clears an optional field on edit by sending null', () => {
    const fromPet = petToForm({ ...buddy, breed: 'Лабрадор', birthDate: '2020-05-01' });
    expect(fromPet).toMatchObject({ breed: 'Лабрадор', birthDate: '01.05.2020' });
    const result = validatePetForm({ ...fromPet, breed: '', birthDate: '' });
    expect(result).toMatchObject({ ok: true, body: { breed: null, birthDate: null } });
  });
});

describe('save errors', () => {
  it('explains why a save failed', () => {
    expect(petSaveErrorKey(new NetworkError())).toBe('pets.form.errors.network');
    // A viewer who still reaches the form (stale screen) gets a clear answer.
    expect(petSaveErrorKey(new ApiError(403, 'forbidden'))).toBe('pets.form.errors.forbidden');
    expect(petSaveErrorKey(new ApiError(500, 'internal'))).toBe('pets.form.errors.unknown');
  });
});

describe('display dates', () => {
  it('parses what people type', () => {
    expect(parseDisplayDate('01.05.2020')).toBe('2020-05-01');
    expect(parseDisplayDate('1.5.2020')).toBe('2020-05-01');
    expect(parseDisplayDate(' 01/05/2020 ')).toBe('2020-05-01');
    expect(parseDisplayDate('05.2020')).toBeNull();
    expect(parseDisplayDate('')).toBeNull();
  });

  it('formats the stored date back for the form', () => {
    expect(formatDisplayDate('2020-05-01')).toBe('01.05.2020');
    expect(formatDisplayDate(null)).toBe('');
  });
});

describe('pet age', () => {
  const today = '2026-11-20';

  it('shows whole years for a pet of one year or more', () => {
    expect(petAge('2020-05-01', today)).toEqual({ unit: 'years', count: 6 });
    expect(petAge('2025-11-20', today)).toEqual({ unit: 'years', count: 1 });
    // The day before the birthday it is still the previous year.
    expect(petAge('2012-11-21', today)).toEqual({ unit: 'years', count: 13 });
  });

  it('shows months for a pet under one year', () => {
    expect(petAge('2026-06-20', today)).toEqual({ unit: 'months', count: 5 });
    expect(petAge('2025-11-21', today)).toEqual({ unit: 'months', count: 11 });
  });

  it('shows "under a month" for a newborn and nothing without a birthday', () => {
    expect(petAge('2026-11-05', today)).toEqual({ unit: 'underMonth' });
    expect(petAge(null, today)).toBeNull();
    expect(petAge('2027-01-01', today)).toBeNull();
  });

  it('takes today from the Kyiv calendar, not UTC', () => {
    // 22:30 UTC on 19 Nov is already 20 Nov in Kyiv (UTC+2 in winter).
    expect(kyivToday(new Date('2026-11-19T22:30:00Z'))).toBe('2026-11-20');
    // 21:30 UTC on 30 June is already 1 July in Kyiv (UTC+3 in summer).
    expect(kyivToday(new Date('2026-06-30T21:30:00Z'))).toBe('2026-07-01');
    expect(kyivToday(new Date('2026-11-19T12:00:00Z'))).toBe('2026-11-19');
  });
});

describe('pet permissions', () => {
  it('owner edits and deletes, editor only edits, viewer only reads', () => {
    expect(petPermissions('owner')).toEqual({ canEdit: true, canDelete: true });
    expect(petPermissions('editor')).toEqual({ canEdit: true, canDelete: false });
    expect(petPermissions('viewer')).toEqual({ canEdit: false, canDelete: false });
  });
});

describe('photo upload', () => {
  const photo: PickedPhoto = {
    uri: 'file:///photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 800_000,
  };
  let api: FakePetsApi;
  let sent: { url: string; headers: Record<string, string>; uri: string }[];
  const putFile = (target: { url: string; headers: Record<string, string> }, p: PickedPhoto) => {
    sent.push({ ...target, uri: p.uri });
    return Promise.resolve();
  };

  beforeEach(() => {
    api = new FakePetsApi();
    sent = [];
  });

  it('gets a signed URL, sends the file there, then attaches it to the pet', async () => {
    const updated = await uploadPetPhoto(api, buddy.id, photo, putFile);
    expect(sent).toEqual([
      {
        url: 'https://storage.example.test/upload',
        headers: { 'content-type': 'image/jpeg' },
        uri: 'file:///photo.jpg',
      },
    ]);
    expect(api.calls).toEqual(['startPhotoUpload', `setPhoto:pets/${buddy.id}/photo/file.jpg`]);
    expect(updated.hero).toBe('photo');
  });

  it('rejects a PDF and a file over 20 MB before any request', async () => {
    await expect(
      uploadPetPhoto(api, buddy.id, { ...photo, contentType: 'application/pdf' }, putFile),
    ).rejects.toMatchObject({ reason: 'type' });
    await expect(
      uploadPetPhoto(api, buddy.id, { ...photo, sizeBytes: MAX_FILE_BYTES + 1 }, putFile),
    ).rejects.toMatchObject({ reason: 'tooLarge' });
    expect(api.calls).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('stops when the server has no file storage (503) and does not send the file', async () => {
    api.photoError = new ApiError(503, 'storage_unavailable');
    await expect(uploadPetPhoto(api, buddy.id, photo, putFile)).rejects.toBeInstanceOf(ApiError);
    expect(sent).toEqual([]);
  });

  it('explains each failure in words', () => {
    const cases: [unknown, string][] = [
      [new ApiError(503, 'storage_unavailable'), 'pets.photo.errors.unavailable'],
      [new ApiError(413, 'file_too_large'), 'pets.photo.errors.tooLarge'],
      [new ApiError(415, 'file_type_not_allowed'), 'pets.photo.errors.type'],
      [new PhotoRejectedError('tooLarge'), 'pets.photo.errors.tooLarge'],
      [new PhotoRejectedError('type'), 'pets.photo.errors.type'],
      [new NetworkError(), 'pets.photo.errors.network'],
      [new ApiError(500, 'internal'), 'pets.photo.errors.unknown'],
    ];
    for (const [error, key] of cases) expect(photoErrorKey(error)).toBe(key);
  });
});

describe('pets queries and cache', () => {
  let api: FakePetsApi;
  let client: QueryClient;

  beforeEach(() => {
    api = new FakePetsApi();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const run = <TData, TVars>(
    options: { mutationFn: (vars: TVars) => Promise<TData>; onSuccess: (data: TData) => void },
    vars: TVars,
  ) => client.getMutationCache().build(client, options).execute(vars);

  it('loads the household: Бадді, Манго and Дим', async () => {
    const pets = await client.query(petsListQuery(api));
    expect(pets.map((p) => p.name)).toEqual(['Бадді', 'Манго', 'Дим']);
    expect((await client.query(petQuery(api, mango.id))).species).toBe('cat');
  });

  it('adds a created pet to the list without reloading it', async () => {
    await client.query(petsListQuery(api));
    const created = await run(createPetMutation(api, client), { name: 'Рекс', species: 'dog' });

    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.map((p) => p.name)).toEqual([
      'Бадді',
      'Манго',
      'Дим',
      'Рекс',
    ]);
    expect(client.getQueryData(petKeys.detail(created.id))).toEqual(created);
    expect(api.calls.filter((c) => c === 'list')).toHaveLength(1);
  });

  it('shows an edit both on the card and in the list', async () => {
    await client.query(petsListQuery(api));
    await run(updatePetMutation(api, client, buddy.id), { breed: 'Лабрадор' });

    expect(client.getQueryData<ApiPet>(petKeys.detail(buddy.id))?.breed).toBe('Лабрадор');
    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.[0]?.breed).toBe('Лабрадор');
  });

  it('removes a deleted pet from the list and forgets its card', async () => {
    await client.query(petsListQuery(api));
    await client.query(petQuery(api, dym.id));
    await run(deletePetMutation(api, client, dym.id), undefined);

    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.map((p) => p.name)).toEqual([
      'Бадді',
      'Манго',
    ]);
    expect(client.getQueryData(petKeys.detail(dym.id))).toBeUndefined();
  });

  it('shows the new photo everywhere after an upload', async () => {
    await client.query(petsListQuery(api));
    const putFile = () => Promise.resolve();
    await run(uploadPetPhotoMutation(api, client, mango.id, putFile), {
      uri: 'file:///mango.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 500_000,
    });

    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.[1]).toMatchObject({
      name: 'Манго',
      hero: 'photo',
    });
  });

  it('keeps the list untouched when the photo upload fails', async () => {
    await client.query(petsListQuery(api));
    api.photoError = new ApiError(503, 'storage_unavailable');
    await expect(
      run(
        uploadPetPhotoMutation(api, client, mango.id, () => Promise.resolve()),
        {
          uri: 'file:///mango.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 500_000,
        },
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.[1]?.hero).toBe('avatar');
  });
  it('saves the pet without a photo when the server has no file storage, and says why', async () => {
    await client.query(petsListQuery(api));
    const created = await run(createPetMutation(api, client), { name: 'Рекс', species: 'dog' });
    api.photoError = new ApiError(503, 'storage_unavailable');

    const result = await attachPhoto(
      api,
      client,
      created,
      { uri: 'file:///rex.jpg', contentType: 'image/jpeg', sizeBytes: 500_000 },
      () => Promise.resolve(),
    );

    expect(result.pet).toEqual(created);
    expect(photoErrorKey(result.photoError)).toBe('pets.photo.errors.unavailable');
    // The pet is in the list, just without a photo.
    expect(client.getQueryData<ApiPet[]>(petKeys.list())?.at(-1)).toMatchObject({
      name: 'Рекс',
      photoUrl: null,
    });
  });

  it('attaches the photo to a freshly created pet when storage works', async () => {
    await client.query(petsListQuery(api));
    const created = await run(createPetMutation(api, client), { name: 'Рекс', species: 'dog' });
    const result = await attachPhoto(
      api,
      client,
      created,
      { uri: 'file:///rex.jpg', contentType: 'image/jpeg', sizeBytes: 500_000 },
      () => Promise.resolve(),
    );
    expect(result.photoError).toBeNull();
    expect(result.pet.hero).toBe('photo');
  });
});
