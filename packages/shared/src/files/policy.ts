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

/** Photos only (pet photo, avatar): every allowed type except PDF. */
export const imageContentTypeSchema = fileContentTypeSchema.exclude(['application/pdf']);

export type ImageContentType = z.infer<typeof imageContentTypeSchema>;

/** Where and how the client uploads a file after the API approved it. */
export const uploadTargetSchema = z
  .object({
    url: z.url(),
    method: z.literal('PUT'),
    /** Send these headers with the upload; they are part of the signature. */
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'UploadTarget' });

export type ApiUploadTarget = z.infer<typeof uploadTargetSchema>;

/** What a client declares before it gets an upload URL. Checked again after the upload. */
export const fileUploadSchema = z.object({
  contentType: fileContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;
