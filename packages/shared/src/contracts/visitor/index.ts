import { z } from 'zod';
import { CommitteeRole } from '../../invariants/enums.js';
import { Id, IsoDateTime } from '../common/index.js';

/**
 * Visitor personal data in `allowlist` mode (ADR-002 §4): only the fields the
 * event declares, each with its own retention and readers, stored apart from
 * every count. In `none` mode none of this is accepted.
 */

export const VisitorFieldType = z.enum(['text', 'email', 'phone', 'number']);
export type VisitorFieldType = z.infer<typeof VisitorFieldType>;

/** A field is personal unless the event says it identifies nobody (ADR-002 §5). */
export const VisitorFieldClass = z.enum(['visitor-personal', 'operational']);
export type VisitorFieldClass = z.infer<typeof VisitorFieldClass>;

export const VisitorFieldCode = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/);

export const VisitorFieldRecord = z
  .object({
    id: Id,
    code: z.string(),
    label: z.string(),
    type: VisitorFieldType,
    classification: VisitorFieldClass,
    /** Days after the event closes that the values are kept. */
    retentionDays: z.number().int(),
    /** The roles that may read the values. */
    readers: z.array(CommitteeRole),
    sortOrder: z.number().int(),
    active: z.boolean(),
  })
  .strict();
export type VisitorFieldRecord = z.infer<typeof VisitorFieldRecord>;

export const CreateVisitorFieldRequest = z
  .object({
    code: VisitorFieldCode,
    label: z.string().trim().min(1).max(80),
    type: VisitorFieldType,
    classification: VisitorFieldClass.default('visitor-personal'),
    retentionDays: z.number().int().min(1).max(3650),
    readers: z.array(CommitteeRole).min(1),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateVisitorFieldRequest = z.infer<typeof CreateVisitorFieldRequest>;

/** The code and the type are what stored values mean, so they never change. */
export const UpdateVisitorFieldRequest = z
  .object({
    label: z.string().trim().min(1).max(80),
    retentionDays: z.number().int().min(1).max(3650),
    readers: z.array(CommitteeRole).min(1),
    sortOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateVisitorFieldRequest = z.infer<typeof UpdateVisitorFieldRequest>;

/** Values a booth sends with one registration, by field code. */
export const VisitorValues = z
  .record(VisitorFieldCode, z.string().trim().max(200))
  .refine((values) => Object.keys(values).length <= 20, { message: 'too many fields' });
export type VisitorValues = z.infer<typeof VisitorValues>;

/** One registration's declared values, as a reader may see them. */
export const VisitorRecordRow = z
  .object({
    registrationId: Id,
    recordedAt: IsoDateTime,
    values: z.record(z.string(), z.string()),
  })
  .strict();
export type VisitorRecordRow = z.infer<typeof VisitorRecordRow>;

/** What the caller may read: the fields their role reads, and those fields' values only. */
export const VisitorRecordsResponse = z
  .object({ fields: z.array(VisitorFieldRecord), data: z.array(VisitorRecordRow) })
  .strict();
export type VisitorRecordsResponse = z.infer<typeof VisitorRecordsResponse>;

export const VisitorRecordsQuery = z
  .object({ from: IsoDateTime.optional(), to: IsoDateTime.optional() })
  .strict();
export type VisitorRecordsQuery = z.infer<typeof VisitorRecordsQuery>;
