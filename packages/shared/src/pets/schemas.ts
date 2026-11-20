import { z } from 'zod';
import { kyivToday, yearsBefore } from '../dates.js';
import { imageContentTypeSchema, MAX_FILE_BYTES, uploadTargetSchema } from '../files/policy.js';

export const petSpeciesSchema = z.enum(['dog', 'cat', 'other']);
export const petSexSchema = z.enum(['male', 'female']);
export const petHeroSchema = z.enum(['avatar', 'photo']);
export const petRoleSchema = z.enum(['owner', 'editor', 'viewer']);

const text = (max: number) => z.string().trim().min(1).max(max);

/** Older than this is a typo in the year (`1020` for `2020`), not a pet. */
export const MAX_PET_AGE_YEARS = 40;

/**
 * Calendar date `YYYY-MM-DD` that really exists, is not after today in Kyiv (where dates are shown)
 * and not more than 40 years ago.
 */
export const birthDateSchema = z.iso.date().superRefine((value, ctx) => {
  const today = kyivToday();
  if (value > today) ctx.addIssue({ code: 'custom', message: 'birth_date_in_future' });
  else if (value < yearsBefore(today, MAX_PET_AGE_YEARS)) {
    ctx.addIssue({ code: 'custom', message: 'birth_date_too_old' });
  }
});

const petFields = {
  name: text(60),
  species: petSpeciesSchema,
  breed: text(80).nullable(),
  sex: petSexSchema.nullable(),
  birthDate: birthDateSchema.nullable(),
  color: text(60).nullable(),
  sterilized: z.boolean().nullable(),
  chipNumber: text(32).nullable(),
  registryNumber: text(32).nullable(),
  tagNumber: text(32).nullable(),
  notes: text(2000).nullable(),
};

export const petSchema = z
  .object({
    id: z.uuid(),
    ...petFields,
    /** What the pet card shows: the drawn avatar or the photo. */
    hero: petHeroSchema,
    /** Short-lived signed URL, or null when there is no photo. Do not store it. */
    photoUrl: z.url().nullable(),
    /** The current user's role for this pet. */
    role: petRoleSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Pet' });

export const petListSchema = z.object({ pets: z.array(petSchema) }).meta({ id: 'PetList' });

/** Manual onboarding path needs only name and species; everything else is optional. */
export const createPetBodySchema = z
  .object({
    name: petFields.name,
    species: petFields.species,
    breed: petFields.breed.optional(),
    sex: petFields.sex.optional(),
    birthDate: petFields.birthDate.optional(),
    color: petFields.color.optional(),
    sterilized: petFields.sterilized.optional(),
    chipNumber: petFields.chipNumber.optional(),
    registryNumber: petFields.registryNumber.optional(),
    tagNumber: petFields.tagNumber.optional(),
    notes: petFields.notes.optional(),
  })
  .meta({ id: 'CreatePetBody' });

/** Any subset of fields; `null` clears an optional field. */
export const updatePetBodySchema = createPetBodySchema
  .partial()
  .extend({ hero: petHeroSchema.optional() })
  .meta({ id: 'UpdatePetBody' });

export const petParamsSchema = z.object({ petId: z.uuid() });

export const petPhotoUploadBodySchema = z
  .object({
    contentType: imageContentTypeSchema,
    sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  })
  .meta({ id: 'PetPhotoUploadBody' });

export const petPhotoUploadResponseSchema = z
  .object({
    /** Send this key back in `PUT /pets/{petId}/photo` after the upload. */
    key: z.string(),
    upload: uploadTargetSchema,
  })
  .meta({ id: 'PetPhotoUploadResponse' });

export const setPetPhotoBodySchema = z
  .object({ key: z.string().min(1).max(300) })
  .meta({ id: 'SetPetPhotoBody' });

export type ApiPet = z.infer<typeof petSchema>;
export type CreatePetBody = z.infer<typeof createPetBodySchema>;
export type UpdatePetBody = z.infer<typeof updatePetBodySchema>;
export type PetRole = z.infer<typeof petRoleSchema>;
export type PetSpecies = z.infer<typeof petSpeciesSchema>;
