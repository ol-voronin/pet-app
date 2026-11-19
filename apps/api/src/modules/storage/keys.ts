import { randomUUID } from 'node:crypto';
import { FILE_EXTENSIONS, type FileContentType } from '@pet-app/shared';
import { z } from 'zod';

export const FILE_KINDS = ['photo', 'document', 'avatar'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const uuid = z.uuid();

/**
 * Object key of a pet's file: `pets/<petId>/<kind>/<uuid>.<ext>`.
 * The key is built on the server only — a client never chooses where a file lands.
 */
export function buildObjectKey(input: {
  petId: string;
  kind: FileKind;
  contentType: FileContentType;
  id?: string;
}): string {
  const petId = uuid.parse(input.petId);
  const id = uuid.parse(input.id ?? randomUUID());
  return `pets/${petId}/${input.kind}/${id}.${FILE_EXTENSIONS[input.contentType]}`;
}

/** True if the key was issued for this pet. Guards against using another pet's key. */
export function isKeyOfPet(key: string, petId: string): boolean {
  if (!uuid.safeParse(petId).success) return false;
  const prefix = `pets/${petId}/`;
  if (!key.startsWith(prefix)) return false;
  return /^(photo|document|avatar)\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(key.slice(prefix.length));
}
