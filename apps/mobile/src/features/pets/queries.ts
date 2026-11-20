import type { ApiPet, CreatePetBody, UpdatePetBody } from '@pet-app/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { PetsApi } from './api';
import { uploadPetPhoto, type PickedPhoto, type PutFile } from './photo';

export const petKeys = {
  all: ['pets'] as const,
  list: () => [...petKeys.all, 'list'] as const,
  detail: (petId: string) => [...petKeys.all, 'detail', petId] as const,
};

export const petsListQuery = (api: PetsApi) => ({
  queryKey: petKeys.list(),
  queryFn: () => api.list(),
});

export const petQuery = (api: PetsApi, petId: string) => ({
  queryKey: petKeys.detail(petId),
  queryFn: () => api.get(petId),
});

/** Puts a saved pet into the cache: its own entry and its place in the list (appended if new). */
export function cachePet(client: QueryClient, pet: ApiPet): void {
  client.setQueryData(petKeys.detail(pet.id), pet);
  client.setQueryData<ApiPet[]>(petKeys.list(), (pets) => {
    if (!pets) return pets;
    return pets.some((p) => p.id === pet.id)
      ? pets.map((p) => (p.id === pet.id ? pet : p))
      : [...pets, pet];
  });
}

export const createPetMutation = (api: PetsApi, client: QueryClient) => ({
  mutationFn: (body: CreatePetBody) => api.create(body),
  onSuccess: (pet: ApiPet) => {
    cachePet(client, pet);
  },
});

export const updatePetMutation = (api: PetsApi, client: QueryClient, petId: string) => ({
  mutationFn: (body: UpdatePetBody) => api.update(petId, body),
  onSuccess: (pet: ApiPet) => {
    cachePet(client, pet);
  },
});

export const deletePetMutation = (api: PetsApi, client: QueryClient, petId: string) => ({
  mutationFn: () => api.remove(petId),
  onSuccess: () => {
    client.setQueryData<ApiPet[]>(petKeys.list(), (pets) => pets?.filter((p) => p.id !== petId));
    client.removeQueries({ queryKey: petKeys.detail(petId) });
  },
});

export const uploadPetPhotoMutation = (
  api: PetsApi,
  client: QueryClient,
  petId: string,
  putFile: PutFile,
) => ({
  mutationFn: (photo: PickedPhoto) => uploadPetPhoto(api, petId, photo, putFile),
  onSuccess: (pet: ApiPet) => {
    cachePet(client, pet);
  },
});

export const removePetPhotoMutation = (api: PetsApi, client: QueryClient, petId: string) => ({
  mutationFn: () => api.removePhoto(petId),
  onSuccess: (pet: ApiPet) => {
    cachePet(client, pet);
  },
});

/**
 * Uploads a photo for a pet that is already saved. A failed upload never loses the pet:
 * the saved pet comes back together with the error, so the screen can explain what happened.
 */
export async function attachPhoto(
  api: PetsApi,
  client: QueryClient,
  pet: ApiPet,
  photo: PickedPhoto,
  putFile: PutFile,
): Promise<{ pet: ApiPet; photoError: unknown }> {
  try {
    const updated = await uploadPetPhoto(api, pet.id, photo, putFile);
    cachePet(client, updated);
    return { pet: updated, photoError: null };
  } catch (photoError) {
    return { pet, photoError };
  }
}
