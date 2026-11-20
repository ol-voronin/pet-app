import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  healthRecords,
  healthRecordSourceEnum,
  healthRecordTypeEnum,
  healthRecordVersions,
} from './health-records.js';

const chunks = (value: { queryChunks: unknown[] }) =>
  value.queryChunks
    .map((chunk) => {
      if (typeof chunk === 'object' && chunk !== null) {
        if ('name' in chunk) return String(chunk.name);
        if ('value' in chunk) return (chunk.value as string[]).join('');
      }
      return '';
    })
    .join('');

describe('health_records schema', () => {
  const config = getTableConfig(healthRecords);
  const byName = new Map(config.columns.map((c) => [c.name, c]));
  const checks = new Map(config.checks.map((c) => [c.name, chunks(c.value)]));

  it('has the record types and sources of the data model', () => {
    expect(healthRecordTypeEnum.enumValues).toEqual([
      'vaccination',
      'treatment',
      'visit',
      'lab',
      'medication',
      'note',
      'weight',
    ]);
    expect(healthRecordSourceEnum.enumValues).toEqual(['manual', 'ocr', 'clinic']);
    expect(byName.get('type')?.notNull).toBe(true);
    expect(byName.get('source')?.notNull).toBe(true);
    expect(byName.get('source')?.default).toBe('manual');
  });

  it('stores every date with time zone and deletes softly', () => {
    for (const name of ['date', 'next_due_date', 'created_at', 'updated_at', 'deleted_at']) {
      expect(byName.get(name)?.getSQLType()).toBe('timestamp with time zone');
    }
    expect(byName.get('date')?.notNull).toBe(true);
    expect(byName.get('deleted_at')?.notNull).toBe(false);
  });

  it('starts versions at 1 and forbids anything lower', () => {
    expect(byName.get('version')?.default).toBe(1);
    expect(byName.get('version')?.notNull).toBe(true);
    expect(checks.get('health_records_version_check')).toBe('version >= 1');
  });

  it('requires a document for an OCR record', () => {
    expect(checks.get('health_records_ocr_document_check')).toBe(
      "source <> 'ocr' OR source_document_id IS NOT NULL",
    );
  });

  it('indexes the timeline of a pet', () => {
    const idx = config.indexes.find((i) => i.config.name === 'health_records_pet_date_idx');
    expect(idx?.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual(['pet_id', 'date']);
  });

  it('keeps a record when its author is deleted', () => {
    const author = config.foreignKeys.find(
      (fk) => fk.reference().columns[0]?.name === 'created_by',
    );
    expect(author?.onDelete).toBe('set null');
    expect(byName.get('created_by')?.notNull).toBe(false);
  });
});

describe('health_record_versions schema', () => {
  const config = getTableConfig(healthRecordVersions);
  const byName = new Map(config.columns.map((c) => [c.name, c]));

  it('stores one snapshot per record version', () => {
    expect(config.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      'health_record_id',
      'version',
    ]);
    expect(byName.get('snapshot')?.notNull).toBe(true);
    expect(byName.get('snapshot')?.getSQLType()).toBe('jsonb');
    expect(config.checks.map((c) => c.name)).toEqual(['health_record_versions_version_check']);
  });

  it('records when the change happened, in UTC', () => {
    expect(byName.get('changed_at')?.getSQLType()).toBe('timestamp with time zone');
    expect(byName.get('changed_at')?.notNull).toBe(true);
  });
});

describe('0007_health_records migration', () => {
  const sql = readFileSync(
    new URL('../../migrations/0007_health_records.sql', import.meta.url),
    'utf8',
  );

  it('only adds', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|ALTER TABLE "(?!health_record)/i);
  });

  it('carries the constraints into the database', () => {
    expect(sql).toContain(`CHECK ("health_records"."version" >= 1)`);
    expect(sql).toContain(`UNIQUE("health_record_id","version")`);
    expect(sql).toContain(`"health_records"."source" <> 'ocr'`);
  });
});
