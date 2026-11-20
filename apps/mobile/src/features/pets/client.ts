import { api } from '@/features/auth/client';
import { unwrap, unwrapEmpty } from '@/shared/api/http';
import type { PetsApi } from './api';
import type { PutFile } from './photo';

const at = (petId: string) => ({ params: { path: { petId } } });

/**
 * Drops `undefined` keys: the generated request types (exactOptionalPropertyTypes) accept a
 * missing key but not an explicit `undefined`, which zod-inferred bodies allow.
 */
const compact = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };

/** PetsApi over the real HTTP client. */
export const petsApi: PetsApi = {
  list: async () => (await unwrap(api.GET('/pets'))).pets,
  get: (petId) => unwrap(api.GET('/pets/{petId}', at(petId))),
  create: (body) => unwrap(api.POST('/pets', { body: compact(body) })),
  update: (petId, body) =>
    unwrap(api.PATCH('/pets/{petId}', { ...at(petId), body: compact(body) })),
  remove: (petId) => unwrapEmpty(api.DELETE('/pets/{petId}', at(petId))),
  startPhotoUpload: (petId, file) =>
    unwrap(api.POST('/pets/{petId}/photo/upload', { ...at(petId), body: file })),
  setPhoto: (petId, key) => unwrap(api.PUT('/pets/{petId}/photo', { ...at(petId), body: { key } })),
  removePhoto: (petId) => unwrap(api.DELETE('/pets/{petId}/photo', at(petId))),
};

/** Sends the picked file straight to storage with the signed URL. */
export const putFile: PutFile = async (target, photo) => {
  const file = await (await fetch(photo.uri)).blob();
  const response = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  if (!response.ok) throw new Error(`upload failed: ${String(response.status)}`);
};
