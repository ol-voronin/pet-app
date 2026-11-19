import { z } from 'zod';

/** Upload limit for a single file (docs/PRD.md, owner decision of 2026-11-19). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Content types a pet's files may have, with the extension used in the object key. */
export const FILE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;

export type FileContentType = keyof typeof FILE_EXTENSIONS;

export const fileContentTypeSchema = z.enum(
  Object.keys(FILE_EXTENSIONS) as [FileContentType, ...FileContentType[]],
);

/** What a client declares before it gets an upload URL. Checked again after the upload. */
export const fileUploadSchema = z.object({
  contentType: fileContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;
