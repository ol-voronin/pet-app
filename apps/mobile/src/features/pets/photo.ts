import { petPhotoUploadBodySchema, MAX_FILE_BYTES, type ApiPet } from '@pet-app/shared';
import { ApiError, NetworkError } from '@/shared/api/http';
import type { PetsApi } from './api';

/** A photo picked on the device, before upload. */
export interface PickedPhoto {
  uri: string;
  contentType: string;
  sizeBytes: number;
}

export type PhotoErrorKey =
  | 'pets.photo.errors.unavailable'
  | 'pets.photo.errors.tooLarge'
  | 'pets.photo.errors.type'
  | 'pets.photo.errors.network'
  | 'pets.photo.errors.unknown';

/** The photo cannot be sent at all: wrong type or over the limit. Caught before any request. */
export class PhotoRejectedError extends Error {
  constructor(readonly reason: 'type' | 'tooLarge') {
    super(reason);
  }
}

/** Sends the file bytes to the signed URL. Injected so tests do not need a network. */
export type PutFile = (
  target: { url: string; headers: Record<string, string> },
  photo: PickedPhoto,
) => Promise<void>;

/**
 * Uploads a pet photo in two steps: signed URL from the API, bytes straight to storage,
 * then the API attaches the file after checking what really arrived.
 */
export async function uploadPetPhoto(
  api: PetsApi,
  petId: string,
  photo: PickedPhoto,
  putFile: PutFile,
): Promise<ApiPet> {
  const file = petPhotoUploadBodySchema.safeParse({
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
  });
  if (!file.success) {
    throw new PhotoRejectedError(photo.sizeBytes > MAX_FILE_BYTES ? 'tooLarge' : 'type');
  }
  const { key, upload } = await api.startPhotoUpload(petId, file.data);
  await putFile({ url: upload.url, headers: upload.headers }, photo);
  return api.setPhoto(petId, key);
}

/** i18n key of the message for a failed photo upload. The pet itself is already saved. */
export function photoErrorKey(error: unknown): PhotoErrorKey {
  if (error instanceof PhotoRejectedError) {
    return error.reason === 'tooLarge' ? 'pets.photo.errors.tooLarge' : 'pets.photo.errors.type';
  }
  if (error instanceof NetworkError) return 'pets.photo.errors.network';
  if (error instanceof ApiError) {
    // 503: the server has no file storage configured yet.
    if (error.status === 503) return 'pets.photo.errors.unavailable';
    if (error.status === 413) return 'pets.photo.errors.tooLarge';
    if (error.status === 415) return 'pets.photo.errors.type';
  }
  return 'pets.photo.errors.unknown';
}
