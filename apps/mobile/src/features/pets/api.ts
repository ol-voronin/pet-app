import type {
  ApiPet,
  ApiUploadTarget,
  CreatePetBody,
  ImageContentType,
  UpdatePetBody,
} from '@pet-app/shared';

/** Pets endpoints. Implementations throw `ApiError` for HTTP errors and `NetworkError` when offline. */
export interface PetsApi {
  list(): Promise<ApiPet[]>;
  get(petId: string): Promise<ApiPet>;
  create(body: CreatePetBody): Promise<ApiPet>;
  update(petId: string, body: UpdatePetBody): Promise<ApiPet>;
  remove(petId: string): Promise<void>;
  startPhotoUpload(
    petId: string,
    file: { contentType: ImageContentType; sizeBytes: number },
  ): Promise<{ key: string; upload: ApiUploadTarget }>;
  setPhoto(petId: string, key: string): Promise<ApiPet>;
  removePhoto(petId: string): Promise<ApiPet>;
}
