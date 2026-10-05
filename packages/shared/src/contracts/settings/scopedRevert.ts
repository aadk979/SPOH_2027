import { z } from 'zod';
import { Id, IdempotencyKey } from '../common/index.js';
import { ScopedSettingsHistoryRecord } from './scopedHistory.js';
import {
  ScopedOperationalSettingKey,
  ScopedSettingsReadResponse,
  ScopedSettingsTarget,
  scopedOperationalKeys,
} from './scopedRead.js';

export const ScopedSettingsRevertRequest = z
  .object({
    target: ScopedSettingsTarget,
    key: ScopedOperationalSettingKey,
    historyId: Id,
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: IdempotencyKey,
  })
  .strict()
  .superRefine((request, ctx) => {
    if (!scopedOperationalKeys(request.target.scope).includes(request.key))
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'Setting is unavailable at this scope',
      });
  });
export type ScopedSettingsRevertRequest = z.infer<typeof ScopedSettingsRevertRequest>;

const Provenance = z
  .object({
    historyId: Id,
    version: z.number().int().positive(),
    operation: z.enum(['set', 'reset']),
  })
  .strict();

/** A restore appends validated history; reset retains removal rather than an invented after. */
export const ScopedSettingsRevertResponse = z
  .object({
    history: ScopedSettingsHistoryRecord,
    current: ScopedSettingsReadResponse,
    reviewedVersion: z.number().int().nonnegative(),
    revertedFrom: Provenance,
  })
  .strict()
  .superRefine((response, ctx) => {
    const { history, current, revertedFrom, reviewedVersion } = response;
    if (!scopedOperationalKeys(current.target.scope).includes(history.key))
      ctx.addIssue({
        code: 'custom',
        path: ['history', 'key'],
        message: 'Setting is unavailable at this scope',
      });
    if (history.version <= reviewedVersion || history.version <= revertedFrom.version)
      ctx.addIssue({
        code: 'custom',
        path: ['history', 'version'],
        message: 'Restore must append a later version',
      });
    if (history.id === revertedFrom.historyId)
      ctx.addIssue({
        code: 'custom',
        path: ['revertedFrom'],
        message: 'Restore must append a new record',
      });
    if (
      !history.createdByYou ||
      !history.values.available ||
      !history.reason ||
      history.reason.trim().length < 3
    )
      ctx.addIssue({
        code: 'custom',
        path: ['history'],
        message: 'Restore requires attributed valid history',
      });
  })
  .superRefine(({ history, revertedFrom }, ctx) => {
    if (history.source !== (revertedFrom.operation === 'reset' ? 'RESET' : 'REVERT'))
      ctx.addIssue({
        code: 'custom',
        path: ['history', 'source'],
        message: 'Source must describe the restore operation',
      });
    if (history.values.available && history.values.operation !== revertedFrom.operation)
      ctx.addIssue({
        code: 'custom',
        path: ['history', 'values'],
        message: 'Operation must match selected history',
      });
  });
export type ScopedSettingsRevertResponse = z.infer<typeof ScopedSettingsRevertResponse>;
