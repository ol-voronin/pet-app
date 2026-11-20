import type { MemoryPetsRepo } from '../pets/memory-repo.js';
import type { CreateDocumentInput, DocumentRecord, DocumentsRepo } from './types.js';

interface StoredDocument extends DocumentRecord {
  deletedAt: Date | null;
}

/** In-memory DocumentsRepo for tests and OpenAPI export. Not for production. */
export class MemoryDocumentsRepo implements DocumentsRepo {
  readonly docs = new Map<string, StoredDocument>();

  constructor(private readonly pets: MemoryPetsRepo) {}

  async getPetRole(petId: string, userId: string) {
    const access = await this.pets.getForUser(petId, userId);
    return access?.role ?? null;
  }

  createDocument(input: CreateDocumentInput) {
    const doc: StoredDocument = {
      id: input.id,
      petId: input.petId,
      uploadedBy: input.uploadedBy,
      storageKey: input.storageKey,
      filename: input.filename,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      pages: null,
      kind: 'file',
      status: 'stored',
      createdAt: input.now,
      deletedAt: null,
    };
    this.docs.set(doc.id, doc);
    return Promise.resolve(toRecord(doc));
  }

  listForPet(petId: string) {
    const items: DocumentRecord[] = [];
    for (const doc of this.docs.values()) {
      if (doc.petId === petId && !doc.deletedAt) items.push(toRecord(doc));
    }
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(items);
  }

  getForPet(documentId: string, petId: string) {
    const doc = this.docs.get(documentId);
    if (!doc || doc.petId !== petId || doc.deletedAt) return Promise.resolve(null);
    return Promise.resolve(toRecord(doc));
  }

  softDelete(documentId: string, petId: string, now: Date) {
    const doc = this.docs.get(documentId);
    if (!doc || doc.petId !== petId || doc.deletedAt) return Promise.resolve(false);
    this.docs.set(documentId, { ...doc, deletedAt: now });
    return Promise.resolve(true);
  }
}

function toRecord({ deletedAt: _deletedAt, ...doc }: StoredDocument): DocumentRecord {
  return doc;
}
