import { z } from 'zod';
import {
  Id,
  ScopedOperationalSettingKey,
  ScopedSettingsTarget,
  type ScopedSettingsRevertResponse,
} from '@spoh/shared';

/** Identifier-only restore receipt; selected immutable history binds the intent. */
export const ScopedRevertReceipt = z
  .object({
    historyId: Id,
    targetHistoryId: Id,
    key: ScopedOperationalSettingKey,
    target: ScopedSettingsTarget,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type ScopedRevertReceipt = z.infer<typeof ScopedRevertReceipt>;
export function toScopedRevertReceipt(response: ScopedSettingsRevertResponse): ScopedRevertReceipt {
  return {
    historyId: response.history.id,
    targetHistoryId: response.revertedFrom.historyId,
    key: response.history.key,
    target: response.current.target,
    expectedVersion: response.reviewedVersion,
  };
}
