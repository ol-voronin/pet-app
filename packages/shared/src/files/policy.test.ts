import { describe, expect, it } from 'vitest';
import { fileUploadSchema, MAX_FILE_BYTES } from './policy.js';

describe('fileUploadSchema', () => {
  it('accepts photos and PDFs up to the limit', () => {
    for (const contentType of ['image/jpeg', 'image/heic', 'application/pdf']) {
      expect(fileUploadSchema.safeParse({ contentType, sizeBytes: MAX_FILE_BYTES }).success).toBe(
        true,
      );
    }
  });

  it('rejects files over 20 MB', () => {
    const result = fileUploadSchema.safeParse({
      contentType: 'image/jpeg',
      sizeBytes: MAX_FILE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty files and unknown types', () => {
    expect(fileUploadSchema.safeParse({ contentType: 'image/jpeg', sizeBytes: 0 }).success).toBe(
      false,
    );
    for (const contentType of ['image/svg+xml', 'application/zip', 'text/html']) {
      expect(fileUploadSchema.safeParse({ contentType, sizeBytes: 1024 }).success).toBe(false);
    }
  });
});
