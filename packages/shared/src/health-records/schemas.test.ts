import { describe, expect, it } from 'vitest';
import {
  createHealthRecordBodySchema,
  HEALTH_RECORD_TYPES,
  healthRecordDetailsSchemas,
  healthRecordSchema,
  healthRecordSourceSchema,
  healthRecordTypeSchema,
  nextHealthRecordVersion,
  parseHealthRecordDetails,
  updateHealthRecordBodySchema,
} from './schemas.js';

const PET = '7b0c2c0e-6f0a-4b3e-9d58-0f6f6f1f2a01';
const USER = '7b0c2c0e-6f0a-4b3e-9d58-0f6f6f1f2a02';
const RECORD = '7b0c2c0e-6f0a-4b3e-9d58-0f6f6f1f2a03';

const rabies = {
  type: 'vaccination',
  date: '2026-11-18T10:00:00.000Z',
  details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
  nextDueDate: '2027-11-18T10:00:00.000Z',
} as const;

describe('health record types and sources', () => {
  it('knows exactly the seven types of the data model', () => {
    expect(healthRecordTypeSchema.options).toEqual([
      'vaccination',
      'treatment',
      'visit',
      'lab',
      'medication',
      'note',
      'weight',
    ]);
    expect(healthRecordTypeSchema.safeParse('grooming').success).toBe(false);
  });

  it('has a details schema for every type', () => {
    expect(Object.keys(healthRecordDetailsSchemas).sort()).toEqual([...HEALTH_RECORD_TYPES].sort());
  });

  it('accepts manual, ocr and clinic as a source and nothing else', () => {
    expect(healthRecordSourceSchema.options).toEqual(['manual', 'ocr', 'clinic']);
    expect(healthRecordSourceSchema.safeParse('import').success).toBe(false);
  });
});

describe('createHealthRecordBodySchema', () => {
  it('accepts a vaccination for the dog and a weight for a cat', () => {
    expect(createHealthRecordBodySchema.safeParse(rabies).success).toBe(true);
    const weight = createHealthRecordBodySchema.safeParse({
      type: 'weight',
      date: '2026-11-20T07:30:00Z',
      details: { valueKg: 4.2 },
    });
    expect(weight.success).toBe(true);
  });

  it('checks details against the type of the record', () => {
    const wrong = createHealthRecordBodySchema.safeParse({
      type: 'weight',
      date: rabies.date,
      details: rabies.details,
    });
    expect(wrong.success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(createHealthRecordBodySchema.safeParse({ ...rabies, type: 'surgery' }).success).toBe(
      false,
    );
  });

  it('takes dates only in UTC', () => {
    for (const date of ['2026-11-18T12:00:00+02:00', '2026-11-18', '18.11.2026']) {
      expect(createHealthRecordBodySchema.safeParse({ ...rabies, date }).success).toBe(false);
    }
  });

  it('does not let the next due date precede the record', () => {
    const result = createHealthRecordBodySchema.safeParse({
      ...rabies,
      nextDueDate: '2026-11-17T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('compares the next due date as an instant when precision is mixed', () => {
    const later = createHealthRecordBodySchema.safeParse({
      ...rabies,
      date: '2026-11-20T10:00:00Z',
      nextDueDate: '2026-11-20T10:00:00.500Z',
    });
    expect(later.success).toBe(true);

    const earlier = createHealthRecordBodySchema.safeParse({
      ...rabies,
      date: '2026-11-20T10:00:00.900Z',
      nextDueDate: '2026-11-20T10:00:00Z',
    });
    expect(earlier.success).toBe(false);

    expect(
      updateHealthRecordBodySchema.safeParse({
        date: '2026-11-20T10:00:00.900Z',
        nextDueDate: '2026-11-20T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('does not let the client choose the source', () => {
    const parsed = createHealthRecordBodySchema.parse({ ...rabies, source: 'clinic' });
    expect(parsed).not.toHaveProperty('source');
  });
});

describe('details by type', () => {
  it('requires a kind for a treatment', () => {
    expect(parseHealthRecordDetails('treatment', { product: 'Bravecto' }).success).toBe(false);
    expect(
      parseHealthRecordDetails('treatment', { kind: 'flea_tick', product: 'Bravecto' }).success,
    ).toBe(true);
  });

  it('keeps lab values as text with an optional reference range', () => {
    const lab = parseHealthRecordDetails('lab', {
      testName: 'Біохімія крові',
      results: [
        { name: 'ALT', value: '112', unit: 'U/L', refMin: 10, refMax: 100, flag: 'high' },
        { name: 'FeLV', value: 'negative' },
      ],
    });
    expect(lab.success).toBe(true);
    expect(
      parseHealthRecordDetails('lab', { testName: 'x', results: [{ name: 'ALT' }] }).success,
    ).toBe(false);
  });

  it('rejects a medication course that ends before it starts', () => {
    const course = { drug: 'Синулокс', startDate: '2026-11-10', endDate: '2026-11-03' };
    expect(parseHealthRecordDetails('medication', course).success).toBe(false);
    expect(
      parseHealthRecordDetails('medication', { ...course, endDate: '2026-11-17' }).success,
    ).toBe(true);
  });

  it('accepts only a positive weight', () => {
    for (const valueKg of [0, -3, Number.NaN]) {
      expect(parseHealthRecordDetails('weight', { valueKg }).success).toBe(false);
    }
    expect(parseHealthRecordDetails('weight', { valueKg: 31.5 }).success).toBe(true);
  });

  it('needs text in a note and allows an empty visit', () => {
    expect(parseHealthRecordDetails('note', { text: '   ' }).success).toBe(false);
    expect(parseHealthRecordDetails('visit', {}).success).toBe(true);
  });
});

describe('updateHealthRecordBodySchema', () => {
  it('accepts any subset of fields and null to clear one', () => {
    expect(updateHealthRecordBodySchema.safeParse({}).success).toBe(true);
    expect(updateHealthRecordBodySchema.safeParse({ title: null, nextDueDate: null }).success).toBe(
      true,
    );
  });

  it('does not let the type, source or version be changed', () => {
    for (const extra of [{ type: 'note' }, { source: 'clinic' }, { version: 7 }]) {
      expect(updateHealthRecordBodySchema.safeParse(extra).success).toBe(false);
    }
  });
});

describe('healthRecordSchema', () => {
  const record = {
    id: RECORD,
    petId: PET,
    type: 'vaccination',
    date: rabies.date,
    title: null,
    details: rabies.details,
    source: 'manual',
    sourceDocumentId: null,
    clinicName: 'Ветклініка',
    vetName: null,
    nextDueDate: rabies.nextDueDate,
    version: 1,
    createdBy: USER,
    createdAt: '2026-11-18T10:05:00.000Z',
    updatedAt: '2026-11-18T10:05:00.000Z',
  };

  it('accepts a stored record', () => {
    expect(healthRecordSchema.safeParse(record).success).toBe(true);
  });

  it('rejects a version below 1 or a fractional one', () => {
    for (const version of [0, -1, 1.5]) {
      expect(healthRecordSchema.safeParse({ ...record, version }).success).toBe(false);
    }
  });

  it('rejects an unknown source', () => {
    expect(healthRecordSchema.safeParse({ ...record, source: 'ai' }).success).toBe(false);
  });
});

describe('nextHealthRecordVersion', () => {
  it('adds one', () => {
    expect(nextHealthRecordVersion(1)).toBe(2);
    expect(nextHealthRecordVersion(41)).toBe(42);
  });

  it('refuses a broken version', () => {
    for (const bad of [0, -2, 1.5, Number.NaN]) {
      expect(() => nextHealthRecordVersion(bad)).toThrow(RangeError);
    }
  });
});
