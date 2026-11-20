import { randomUUID } from 'node:crypto';
import type {
  ApiDocument,
  ApiDownloadTarget,
  ApiUploadTarget,
  ConfirmDocumentBody,
  DocumentUploadBody,
  PetRole,
} from '@pet-app/shared';
import { confirmUpload, isKeyOfPet, startUpload, type FileStorage } from '../storage/index.js';
import { DocumentError } from './errors.js';
import type { DocumentRecord, DocumentsRepo } from './types.js';

export interface DocumentsServiceDeps {
  repo: DocumentsRepo;
  /** Null when `S3_*` is not configured: upload/download routes answer 503. */
  storage: FileStorage | null;
  clock?: () => Date;
}

const canEdit = (role: PetRole) => role === 'owner' || role === 'editor';

export class DocumentsService {
  private readonly repo: DocumentsRepo;
  private readonly storage: FileStorage | null;
  private readonly clock: () => Date;

  constructor(deps: DocumentsServiceDeps) {
    this.repo = deps.repo;
    this.storage = deps.storage;
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Step 1 of 2: issues a short-lived signed PUT URL for a plain file (`kind = document`). */
  async startUpload(
    userId: string,
    petId: string,
    file: DocumentUploadBody,
  ): Promise<{ key: string; upload: ApiUploadTarget }> {
    const storage = this.requireStorage();
    await this.editable(userId, petId);
    const { key, upload } = await startUpload(
      storage,
      { petId, kind: 'document', ...file },
      this.clock(),
    );
    return { key, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
  }

  /** Step 2 of 2: verifies the uploaded object in S3 and saves the `stored` document row. */
  async confirmUpload(
    userId: string,
    petId: string,
    body: ConfirmDocumentBody,
  ): Promise<ApiDocument> {
    const storage = this.requireStorage();
    await this.editable(userId, petId);
    if (!isKeyOfPet(body.key, petId) || !body.key.startsWith(`pets/${petId}/document/`)) {
      throw new DocumentError('invalid_file_key');
    }
    const uploaded = await confirmUpload(storage, body.key);
    const doc = await this.repo.createDocument({
      id: randomUUID(),
      petId,
      uploadedBy: userId,
      storageKey: body.key,
      filename: body.filename,
      mime: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      now: this.clock(),
    });
    return present(doc);
  }

  async list(userId: string, petId: string): Promise<ApiDocument[]> {
    await this.access(userId, petId);
    const docs = await this.repo.listForPet(petId);
    return docs.map(present);
  }

  /** Issues a short-lived signed GET URL; URLs are never stored in the database. */
  async getDownloadUrl(
    userId: string,
    petId: string,
    documentId: string,
  ): Promise<ApiDownloadTarget> {
    const storage = this.requireStorage();
    await this.access(userId, petId);
    const doc = await this.repo.getForPet(documentId, petId);
    if (!doc) throw new DocumentError('document_not_found');
    const target = await storage.createDownloadUrl({
      key: doc.storageKey,
      filename: doc.filename,
      now: this.clock(),
    });
    return { url: target.url, expiresAt: target.expiresAt.toISOString() };
  }

  async remove(userId: string, petId: string, documentId: string): Promise<void> {
    await this.editable(userId, petId);
    const doc = await this.repo.getForPet(documentId, petId);
    if (!doc) throw new DocumentError('document_not_found');
    await this.repo.softDelete(documentId, petId, this.clock());
    if (this.storage) await this.storage.delete(doc.storageKey);
  }

  /** A pet the user is not a member of looks like a missing pet: its existence is not revealed. */
  private async access(userId: string, petId: string): Promise<PetRole> {
    const role = await this.repo.getPetRole(petId, userId);
    if (!role) throw new DocumentError('pet_not_found');
    return role;
  }

  private async editable(userId: string, petId: string): Promise<PetRole> {
    const role = await this.access(userId, petId);
    if (!canEdit(role)) throw new DocumentError('forbidden');
    return role;
  }

  private requireStorage(): FileStorage {
    if (!this.storage) throw new DocumentError('storage_unavailable');
    return this.storage;
  }
}

function present(doc: DocumentRecord): ApiDocument {
  return {
    id: doc.id,
    petId: doc.petId,
    uploadedBy: doc.uploadedBy,
    filename: doc.filename,
    mime: doc.mime,
    sizeBytes: doc.sizeBytes,
    pages: doc.pages,
    kind: doc.kind,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}
