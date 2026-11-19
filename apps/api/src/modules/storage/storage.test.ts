import { MAX_FILE_BYTES } from '@pet-app/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { StorageError } from './errors.js';
import { createStorage } from './index.js';
import { buildObjectKey, isKeyOfPet } from './keys.js';
import { MemoryFileStorage } from './memory-storage.js';
import { S3FileStorage } from './s3-storage.js';
import { confirmUpload, startUpload } from './uploads.js';

const petId = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
const otherPetId = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const fileId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const now = new Date('2026-11-19T10:00:00Z');

describe('buildObjectKey', () => {
  it('puts a file under its pet and kind with the extension of its type', () => {
    expect(buildObjectKey({ petId, kind: 'photo', contentType: 'image/jpeg', id: fileId })).toBe(
      `pets/${petId}/photo/${fileId}.jpg`,
    );
    expect(
      buildObjectKey({ petId, kind: 'document', contentType: 'application/pdf', id: fileId }),
    ).toBe(`pets/${petId}/document/${fileId}.pdf`);
  });

  it('generates a new id for every file', () => {
    const a = buildObjectKey({ petId, kind: 'photo', contentType: 'image/png' });
    const b = buildObjectKey({ petId, kind: 'photo', contentType: 'image/png' });
    expect(a).not.toBe(b);
  });

  it('refuses a pet id that could escape the prefix', () => {
    expect(() =>
      buildObjectKey({ petId: '../other', kind: 'photo', contentType: 'image/png' }),
    ).toThrow();
  });
});

describe('isKeyOfPet', () => {
  const key = `pets/${petId}/photo/${fileId}.jpg`;

  it('accepts a key issued for the pet', () => {
    expect(isKeyOfPet(key, petId)).toBe(true);
  });

  it("rejects another pet's key and malformed keys", () => {
    expect(isKeyOfPet(key, otherPetId)).toBe(false);
    expect(isKeyOfPet(`pets/${petId}/photo/../../${otherPetId}/photo/${fileId}.jpg`, petId)).toBe(
      false,
    );
    expect(isKeyOfPet(`pets/${petId}/secret/${fileId}.jpg`, petId)).toBe(false);
    expect(isKeyOfPet(key, 'not-a-uuid')).toBe(false);
  });
});

describe('startUpload', () => {
  it('issues an upload URL for a server-chosen key', async () => {
    const storage = new MemoryFileStorage();
    const { key, upload } = await startUpload(
      storage,
      { petId, kind: 'photo', contentType: 'image/jpeg', sizeBytes: 1024 },
      now,
    );
    expect(isKeyOfPet(key, petId)).toBe(true);
    expect(upload.method).toBe('PUT');
    expect(upload.headers['content-type']).toBe('image/jpeg');
    expect(upload.expiresAt).toEqual(new Date('2026-11-19T10:10:00Z'));
  });

  it('rejects a type that is not allowed', async () => {
    await expect(
      startUpload(new MemoryFileStorage(), {
        petId,
        kind: 'document',
        contentType: 'application/zip',
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'file_type_not_allowed', statusCode: 415 });
  });

  it('rejects a file over 20 MB before any URL is issued', async () => {
    await expect(
      startUpload(new MemoryFileStorage(), {
        petId,
        kind: 'document',
        contentType: 'application/pdf',
        sizeBytes: MAX_FILE_BYTES + 1,
      }),
    ).rejects.toMatchObject({ code: 'file_too_large', statusCode: 413 });
  });
});

describe('confirmUpload', () => {
  const key = `pets/${petId}/document/${fileId}.pdf`;

  it('returns the real size and type of the uploaded object', async () => {
    const storage = new MemoryFileStorage();
    storage.put(key, { sizeBytes: 2048, contentType: 'application/pdf' });
    await expect(confirmUpload(storage, key)).resolves.toEqual({
      sizeBytes: 2048,
      contentType: 'application/pdf',
    });
  });

  it('fails when nothing was uploaded', async () => {
    await expect(confirmUpload(new MemoryFileStorage(), key)).rejects.toBeInstanceOf(StorageError);
  });

  it('deletes an oversized object', async () => {
    const storage = new MemoryFileStorage();
    storage.put(key, { sizeBytes: MAX_FILE_BYTES + 1, contentType: 'application/pdf' });
    await expect(confirmUpload(storage, key)).rejects.toMatchObject({ code: 'file_too_large' });
    expect(storage.objects.has(key)).toBe(false);
  });

  it('deletes an object of a type that is not allowed', async () => {
    const storage = new MemoryFileStorage();
    storage.put(key, { sizeBytes: 2048, contentType: 'text/html' });
    await expect(confirmUpload(storage, key)).rejects.toMatchObject({ code: 'file_mismatch' });
    expect(storage.objects.has(key)).toBe(false);
  });
});

describe('S3FileStorage signed URLs', () => {
  const storage = new S3FileStorage({
    endpoint: 'https://storage.example.test',
    region: 'eu-central-1',
    bucket: 'pet-app-files',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret',
    forcePathStyle: true,
  });
  const key = `pets/${petId}/photo/${fileId}.jpg`;

  it('signs an upload for 10 minutes and binds the type and size', async () => {
    const upload = await storage.createUploadUrl({
      key,
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      now,
    });
    const url = new URL(upload.url);
    expect(url.origin).toBe('https://storage.example.test');
    expect(url.pathname).toBe(`/pet-app-files/${key}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host']),
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(upload.url).not.toContain('test-secret');
    expect(upload.expiresAt).toEqual(new Date('2026-11-19T10:10:00Z'));
  });

  it('signs a download for 15 minutes with the original file name', async () => {
    const download = await storage.createDownloadUrl({ key, filename: 'Паспорт Барсика.pdf', now });
    const url = new URL(download.url);
    expect(url.pathname).toBe(`/pet-app-files/${key}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('response-content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('Паспорт Барсика.pdf')}`,
    );
    expect(download.expiresAt).toEqual(new Date('2026-11-19T10:15:00Z'));
  });
});

describe('storage config', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost/db', JWT_SECRET: 'x'.repeat(32) };
  const s3 = {
    S3_ENDPOINT: 'https://storage.example.test',
    S3_REGION: 'eu-central-1',
    S3_BUCKET: 'pet-app-files',
    S3_ACCESS_KEY_ID: 'test-key-id',
    S3_SECRET_ACCESS_KEY: 'test-secret',
  };

  it('runs without storage when S3_* is not set', () => {
    expect(createStorage(loadConfig(base))).toBeNull();
  });

  it('creates S3 storage when S3_* is complete', () => {
    expect(createStorage(loadConfig({ ...base, ...s3 }))).toBeInstanceOf(S3FileStorage);
  });

  it('refuses a partial S3 configuration', () => {
    expect(() => loadConfig({ ...base, ...s3, S3_SECRET_ACCESS_KEY: undefined })).toThrow(
      /S3_SECRET_ACCESS_KEY/,
    );
  });
});
