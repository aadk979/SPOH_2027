import { CaptureScheduleIntent } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';

/** An edit's immutable key is read in the transaction before its new value can be validated. */
export function parseUpdatedScheduleIntent(input: unknown): CaptureScheduleIntent {
  const parsed = CaptureScheduleIntent.safeParse(input);
  if (!parsed.success)
    throw new ValidationError('Invalid scheduled setting value', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  return parsed.data;
}
