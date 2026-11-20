import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { petsApi, putFile } from './client';
import {
  createPetMutation,
  deletePetMutation,
  petQuery,
  petsListQuery,
  removePetPhotoMutation,
  updatePetMutation,
  uploadPetPhotoMutation,
} from './queries';

// Thin wrappers: what each hook fetches and how it updates the cache is defined (and tested) in queries.ts.

export const usePets = (options?: { enabled?: boolean }) =>
  useQuery({ ...petsListQuery(petsApi), enabled: options?.enabled ?? true });

export const usePet = (petId: string) => useQuery(petQuery(petsApi, petId));

export const useCreatePet = () => useMutation(createPetMutation(petsApi, useQueryClient()));

export const useUpdatePet = (petId: string) =>
  useMutation(updatePetMutation(petsApi, useQueryClient(), petId));

export const useDeletePet = (petId: string) =>
  useMutation(deletePetMutation(petsApi, useQueryClient(), petId));

export const useUploadPetPhoto = (petId: string) =>
  useMutation(uploadPetPhotoMutation(petsApi, useQueryClient(), petId, putFile));

export const useRemovePetPhoto = (petId: string) =>
  useMutation(removePetPhotoMutation(petsApi, useQueryClient(), petId));
