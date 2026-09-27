import { ERROR_CODES, type ErrorCode } from '@spoh/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../errors/index.js';

/**
 * Database errors that are the caller's fault, as the answer they deserve
 * (F03-002). Every check-then-create in the services keeps its pre-check for
 * the friendlier message; this catches what the pre-check cannot: a rename
 * with no check, and two requests racing past the same one.
 */

/**
 * Unique constraints whose clash has its own error code, by index name
 * (Prisma names them <Model>_<fields>_key). Anything else is CONFLICT.
 */
const UNIQUE_CODES: Record<string, { code: ErrorCode; message: string }> = {
  GiftType_name_key: {
    code: ERROR_CODES.GIFT_TYPE_EXISTS,
    message: 'A gift type with that name already exists.',
  },
  EventDay_date_key: {
    code: ERROR_CODES.EVENT_DAY_EXISTS,
    message: 'That date is already an event day.',
  },
};

interface UniqueMeta {
  modelName?: string;
  target?: string[] | string;
  driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } };
}

/**
 * The violated constraint's index name. The pg driver adapter reports the
 * index; Prisma's own engine reports the fields, from which the conventional
 * name is rebuilt.
 */
function constraintName(meta: UniqueMeta | undefined): string {
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  if (constraint?.index) return constraint.index;
  const fields = meta?.target ?? constraint?.fields ?? [];
  const list = (Array.isArray(fields) ? fields : [fields]).map((field) => field.replace(/"/g, ''));
  return `${meta?.modelName ?? ''}_${list.join('_')}_key`;
}

function uniqueViolation(meta: UniqueMeta | undefined): AppError {
  const known = UNIQUE_CODES[constraintName(meta)];
  return known
    ? new AppError(409, known.code, known.message)
    : new AppError(409, ERROR_CODES.CONFLICT, 'That conflicts with a record that already exists.');
}

/** The AppError for a Prisma error the client caused, or null for a real fault. */
export function fromDatabaseError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === 'P2002') return uniqueViolation(error.meta as UniqueMeta | undefined);
  if (error.code === 'P2025') return new AppError(404, ERROR_CODES.NOT_FOUND, 'Not found');
  return null;
}
