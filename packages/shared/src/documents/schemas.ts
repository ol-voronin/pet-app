import { z } from 'zod';
import { fileContentTypeSchema, fileUploadSchema, uploadTargetSchema } from '../files/policy.js';

export const documentKindSchema = z.enum(['scan', 'file']);
export const documentStatusSchema = z.enum([
  'stored',
  'uploaded',
  'processing',
  'needs_review',
  'confirmed',
  'failed',
]);

export const documentSchema = z
  .object({
    id: z.uuid(),
    petId: z.uuid(),
    uploadedBy: z.uuid().nullable(),
    filename: z.string().min(1).max(255),
    mime: fileContentTypeSchema,
    sizeBytes: z.number().int().positive(),
    pages: z.number().int().positive().nullable(),
    kind: documentKindSchema,
    status: documentStatusSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Document' });

export const documentListSchema = z
  .object({ documents: z.array(documentSchema) })
  .meta({ id: 'DocumentList' });

export const documentParamsSchema = z.object({
  petId: z.uuid(),
  documentId: z.uuid(),
});

export const documentUploadBodySchema = fileUploadSchema.meta({ id: 'DocumentUploadBody' });

export const documentUploadResponseSchema = z
  .object({
    /** Send this key back in `POST /pets/{petId}/documents` after the upload. */
    key: z.string(),
    upload: uploadTargetSchema,
  })
  .meta({ id: 'DocumentUploadResponse' });

export const confirmDocumentBodySchema = z
  .object({
    key: z.string().min(1).max(300),
    filename: z.string().trim().min(1).max(255),
  })
  .meta({ id: 'ConfirmDocumentBody' });

export type ApiDocument = z.infer<typeof documentSchema>;
export type DocumentKind = z.infer<typeof documentKindSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentUploadBody = z.infer<typeof documentUploadBodySchema>;
export type ConfirmDocumentBody = z.infer<typeof confirmDocumentBodySchema>;
