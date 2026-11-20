import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { documents } from './documents.js';

describe('documents schema', () => {
  const config = getTableConfig(documents);
  const byName = new Map(config.columns.map((c) => [c.name, c]));

  it('stores timestamps with time zone and supports soft delete', () => {
    for (const name of ['created_at', 'deleted_at']) {
      expect(byName.get(name)?.getSQLType()).toBe('timestamp with time zone');
    }
    expect(byName.get('deleted_at')?.notNull).toBe(false);
  });

  it('stores object key, not URL, and defaults to file / stored', () => {
    expect([...byName.keys()]).toContain('storage_key');
    expect([...byName.keys()].some((name) => name.endsWith('_url'))).toBe(false);
    expect(byName.get('kind')?.default).toBe('file');
    expect(byName.get('status')?.default).toBe('stored');
  });

  it('keeps OCR fields nullable for plain file uploads', () => {
    for (const name of ['pages', 'doc_type', 'model', 'prompt_version', 'raw_extraction']) {
      expect(byName.get(name)?.notNull).toBe(false);
    }
  });
});
