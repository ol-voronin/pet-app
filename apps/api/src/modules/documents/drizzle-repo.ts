import { documents, petMembers, pets, type Db, type Document } from '@pet-app/db';
import type { FileContentType } from '@pet-app/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { CreateDocumentInput, DocumentRecord, DocumentsRepo } from './types.js';

const toRecord = (d: Document): DocumentRecord => ({
  id: d.id,
  petId: d.petId,
  uploadedBy: d.uploadedBy,
  storageKey: d.storageKey,
  filename: d.filename,
  mime: d.mime as FileContentType,
  sizeBytes: d.sizeBytes,
  pages: d.pages,
  kind: d.kind,
  status: d.status,
  createdAt: d.createdAt,
});

/** Postgres (Neon) implementation of DocumentsRepo. */
export class DrizzleDocumentsRepo implements DocumentsRepo {
  constructor(private readonly db: Db) {}

  async getPetRole(petId: string, userId: string) {
    const [row] = await this.db
      .select({ role: petMembers.role })
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(
        and(eq(petMembers.petId, petId), eq(petMembers.userId, userId), isNull(pets.deletedAt)),
      );
    return row?.role ?? null;
  }

  async createDocument(input: CreateDocumentInput) {
    const [row] = await this.db
      .insert(documents)
      .values({
        id: input.id,
        petId: input.petId,
        uploadedBy: input.uploadedBy,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        kind: 'file',
        status: 'stored',
        createdAt: input.now,
      })
      .returning();
    if (!row) throw new Error('insert documents returned no row');
    return toRecord(row);
  }

  async listForPet(petId: string) {
    const rows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.petId, petId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt));
    return rows.map(toRecord);
  }

  async getForPet(documentId: string, petId: string) {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.petId, petId), isNull(documents.deletedAt)),
      );
    return row ? toRecord(row) : null;
  }

  async softDelete(documentId: string, petId: string, now: Date) {
    const rows = await this.db
      .update(documents)
      .set({ deletedAt: now })
      .where(
        and(eq(documents.id, documentId), eq(documents.petId, petId), isNull(documents.deletedAt)),
      )
      .returning({ id: documents.id });
    return rows.length > 0;
  }
}
