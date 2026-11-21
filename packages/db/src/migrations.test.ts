import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The migration journal must stay in a shape the Drizzle migrator can trust (#84). Several people write migrations
 * in parallel; a renamed file whose `when` is older than the last applied one is skipped by the migrator silently.
 * Schema-vs-snapshot drift is checked in CI by running `drizzle-kit generate` and expecting no new files.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function journal(): JournalEntry[] {
  const raw = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return raw.entries;
}

describe('migration journal', () => {
  const entries = journal();

  it('numbers migrations 0, 1, 2… with no gaps or repeats', () => {
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i));
  });

  it('gives every migration a file prefix equal to its number', () => {
    for (const entry of entries) {
      expect(entry.tag.slice(0, 5), entry.tag).toBe(`${String(entry.idx).padStart(4, '0')}_`);
    }
  });

  it('keeps `when` strictly increasing, or the migrator skips the later file', () => {
    for (let i = 1; i < entries.length; i += 1) {
      const [before, after] = [entries[i - 1], entries[i]];
      expect(
        after?.when,
        `${after?.tag ?? ''} must be later than ${before?.tag ?? ''}: do not rename a migration — delete it, rebase on main and run pnpm -F db generate again`,
      ).toBeGreaterThan(before?.when ?? 0);
    }
  });

  it('has one SQL file and one snapshot per entry, and no stray SQL files', () => {
    const sqlFiles = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(sqlFiles).toEqual(entries.map((e) => `${e.tag}.sql`).sort());
    for (const entry of entries) {
      const snapshot = join(dir, 'meta', `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
      expect(existsSync(snapshot), snapshot).toBe(true);
    }
  });
});
