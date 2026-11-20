import type { DocumentKind, DocumentStatus, FileContentType, PetRole } from '@pet-app/shared';

export interface DocumentRecord {
  id: string;
  petId: string;
  uploadedBy: string | null;
  /** Object key in the private bucket (ADR-0006); never a URL. */
  storageKey: string;
  filename: string;
  mime: FileContentType;
  sizeBytes: number;
  pages: number | null;
  kind: DocumentKind;
  status: DocumentStatus;
  createdAt: Date;
}

export interface CreateDocumentInput {
  id: string;
  petId: string;
  uploadedBy: string;
  storageKey: string;
  filename: string;
  mime: FileContentType;
  sizeBytes: number;
  now: Date;
}

/** Storage port for pet documents. Drizzle in production, in-memory in tests. */
export interface DocumentsRepo {
  /** User's role for a non-deleted pet, or null if not a member / pet missing. */
  getPetRole(petId: string, userId: string): Promise<PetRole | null>;
  createDocument(input: CreateDocumentInput): Promise<DocumentRecord>;
  /** Non-deleted documents for a pet, newest first. */
  listForPet(petId: string): Promise<DocumentRecord[]>;
  getForPet(documentId: string, petId: string): Promise<DocumentRecord | null>;
  /** Soft delete: sets `deleted_at`; returns false if not found or already deleted. */
  softDelete(documentId: string, petId: string, now: Date): Promise<boolean>;
}
