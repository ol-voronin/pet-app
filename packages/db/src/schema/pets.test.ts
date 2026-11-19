import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { petMembers, pets } from './pets.js';

describe('pets schema', () => {
  const config = getTableConfig(pets);
  const byName = new Map(config.columns.map((c) => [c.name, c]));

  it('stores timestamps with time zone and supports soft delete', () => {
    for (const name of ['created_at', 'updated_at', 'deleted_at']) {
      expect(byName.get(name)?.getSQLType()).toBe('timestamp with time zone');
    }
    expect(byName.get('deleted_at')?.notNull).toBe(false);
  });

  it('keeps the birthday as a calendar date and files as object keys, not URLs', () => {
    expect(byName.get('birth_date')?.getSQLType()).toBe('date');
    expect([...byName.keys()]).toEqual(expect.arrayContaining(['photo_key', 'avatar_key']));
    expect([...byName.keys()].some((name) => name.endsWith('_url'))).toBe(false);
  });

  it('shows the avatar by default', () => {
    expect(byName.get('hero')?.default).toBe('avatar');
  });

  it('allows one role per user and pet', () => {
    const members = getTableConfig(petMembers);
    expect(members.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(['pet_id', 'user_id']);
  });
});
