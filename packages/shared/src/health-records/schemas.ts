import { z } from 'zod';

export const HEALTH_RECORD_TYPES = [
  'vaccination',
  'treatment',
  'visit',
  'lab',
  'medication',
  'note',
  'weight',
] as const;

export const healthRecordTypeSchema = z.enum(HEALTH_RECORD_TYPES);
/** Where a record came from. `ocr` records exist only after the user has confirmed the scan. */
export const healthRecordSourceSchema = z.enum(['manual', 'ocr', 'clinic']);
export const treatmentKindSchema = z.enum(['flea_tick', 'deworming']);
export const labFlagSchema = z.enum(['low', 'normal', 'high']);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().optional();
/** Moment in UTC (`…Z`). Shown in `Europe/Kyiv` by the client. */
const utcDateTime = z.iso.datetime();

export const vaccinationDetailsSchema = z
  .object({
    vaccineName: text(120),
    /** Reference to the vaccines directory, when the name was matched. */
    vaccineNormalizedId: z.uuid().nullable().optional(),
    batch: optionalText(60),
    /** What it protects against: `rabies`, `dhppi`… */
    against: z.array(text(40)).max(20).default([]),
  })
  .meta({ id: 'VaccinationDetails' });

export const treatmentDetailsSchema = z
  .object({
    kind: treatmentKindSchema,
    product: text(120),
    productNormalizedId: z.uuid().nullable().optional(),
  })
  .meta({ id: 'TreatmentDetails' });

export const medicationDetailsSchema = z
  .object({
    drug: text(120),
    dose: optionalText(120),
    frequency: optionalText(120),
    /** Calendar dates `YYYY-MM-DD`: a course starts and ends on a day, not at a moment. */
    startDate: z.iso.date().nullable().optional(),
    endDate: z.iso.date().nullable().optional(),
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
    'end_before_start',
  )
  .meta({ id: 'MedicationDetails' });

export const labResultSchema = z
  .object({
    name: text(120),
    /** Text, not a number: results come as `12.4`, `< 0.5`, `negative`. */
    value: text(60),
    unit: optionalText(30),
    refMin: z.number().nullable().optional(),
    refMax: z.number().nullable().optional(),
    flag: labFlagSchema.nullable().optional(),
  })
  .meta({ id: 'LabResult' });

export const labDetailsSchema = z
  .object({
    testName: text(160),
    results: z.array(labResultSchema).max(200).default([]),
  })
  .meta({ id: 'LabDetails' });

/** `diagnosisText` is what the vet wrote. The app itself never makes a diagnosis. */
export const visitDetailsSchema = z
  .object({
    reason: optionalText(500),
    diagnosisText: optionalText(2000),
    recommendations: optionalText(4000),
  })
  .meta({ id: 'VisitDetails' });

export const weightDetailsSchema = z
  .object({ valueKg: z.number().positive().max(1000) })
  .meta({ id: 'WeightDetails' });

export const noteDetailsSchema = z.object({ text: text(5000) }).meta({ id: 'NoteDetails' });

/** Shape of `details` for every record type — one source for the API, the app and OCR. */
export const healthRecordDetailsSchemas = {
  vaccination: vaccinationDetailsSchema,
  treatment: treatmentDetailsSchema,
  visit: visitDetailsSchema,
  lab: labDetailsSchema,
  medication: medicationDetailsSchema,
  note: noteDetailsSchema,
  weight: weightDetailsSchema,
} as const satisfies Record<z.infer<typeof healthRecordTypeSchema>, z.ZodType>;

const typedDetails = [
  z.object({ type: z.literal('vaccination'), details: vaccinationDetailsSchema }),
  z.object({ type: z.literal('treatment'), details: treatmentDetailsSchema }),
  z.object({ type: z.literal('visit'), details: visitDetailsSchema }),
  z.object({ type: z.literal('lab'), details: labDetailsSchema }),
  z.object({ type: z.literal('medication'), details: medicationDetailsSchema }),
  z.object({ type: z.literal('note'), details: noteDetailsSchema }),
  z.object({ type: z.literal('weight'), details: weightDetailsSchema }),
] as const;

/** `type` together with the `details` that belong to it. */
export const healthRecordTypedDetailsSchema = z.discriminatedUnion('type', typedDetails);

const editableFields = {
  /** When it happened, UTC. */
  date: utcDateTime,
  title: optionalText(160),
  clinicName: optionalText(160),
  vetName: optionalText(120),
  nextDueDate: utcDateTime.nullable().optional(),
};

const dueAfterDate = (value: {
  date?: string | undefined;
  nextDueDate?: string | null | undefined;
}) =>
  // Compare instants, not strings: `…:00Z` and `…:00.500Z` are both valid and sort wrongly as text.
  !value.date || !value.nextDueDate || Date.parse(value.nextDueDate) >= Date.parse(value.date);

/** A record as the API returns it. */
export const healthRecordSchema = z
  .object({
    id: z.uuid(),
    petId: z.uuid(),
    date: utcDateTime,
    title: z.string().nullable(),
    source: healthRecordSourceSchema,
    sourceDocumentId: z.uuid().nullable(),
    clinicName: z.string().nullable(),
    vetName: z.string().nullable(),
    nextDueDate: utcDateTime.nullable(),
    /** Starts at 1 and grows by one with every edit. */
    version: z.number().int().min(1),
    /** `null` when the author's account no longer exists. */
    createdBy: z.uuid().nullable(),
    createdAt: utcDateTime,
    updatedAt: utcDateTime,
  })
  .and(healthRecordTypedDetailsSchema)
  .meta({ id: 'HealthRecord' });

/**
 * Manual entry. `source` is not accepted from the client: the server sets `manual` here,
 * `ocr` on scan confirmation and `clinic` for records that come from a clinic.
 */
export const createHealthRecordBodySchema = z
  .object(editableFields)
  .and(healthRecordTypedDetailsSchema)
  .refine(dueAfterDate, 'next_due_before_date')
  .meta({ id: 'CreateHealthRecordBody' });

/**
 * Any subset of fields; `null` clears an optional one. The type of a record never changes.
 * `details`, when sent, replaces the old value whole — validate it with
 * `parseHealthRecordDetails` against the stored type.
 */
export const updateHealthRecordBodySchema = z
  .object({
    ...editableFields,
    date: utcDateTime.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(dueAfterDate, 'next_due_before_date')
  .meta({ id: 'UpdateHealthRecordBody' });

/** One replaced version: the record as it was before the edit. */
export const healthRecordVersionSchema = z
  .object({
    id: z.uuid(),
    healthRecordId: z.uuid(),
    version: z.number().int().min(1),
    snapshot: healthRecordSchema,
    changedBy: z.uuid().nullable(),
    changedAt: utcDateTime,
  })
  .meta({ id: 'HealthRecordVersion' });

export type HealthRecordType = z.infer<typeof healthRecordTypeSchema>;
export type HealthRecordSource = z.infer<typeof healthRecordSourceSchema>;
export type ApiHealthRecord = z.infer<typeof healthRecordSchema>;
export type CreateHealthRecordBody = z.infer<typeof createHealthRecordBodySchema>;
export type UpdateHealthRecordBody = z.infer<typeof updateHealthRecordBodySchema>;
export type ApiHealthRecordVersion = z.infer<typeof healthRecordVersionSchema>;
export type HealthRecordDetails = {
  [T in HealthRecordType]: z.infer<(typeof healthRecordDetailsSchemas)[T]>;
};

/** Validates `details` for a known record type (edits, OCR output). */
export function parseHealthRecordDetails<T extends HealthRecordType>(
  type: T,
  details: unknown,
): z.ZodSafeParseResult<HealthRecordDetails[T]> {
  const schema: z.ZodType = healthRecordDetailsSchemas[type];
  return schema.safeParse(details) as z.ZodSafeParseResult<HealthRecordDetails[T]>;
}

/** The record's version after an edit. */
export function nextHealthRecordVersion(current: number): number {
  if (!Number.isInteger(current) || current < 1) throw new RangeError('invalid_version');
  return current + 1;
}
