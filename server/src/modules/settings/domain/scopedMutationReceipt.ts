import { z } from 'zod';
import {
  Id,
  ScopedOperationalSettingKey,
  ScopedSettingsTarget,
  type ScopedSettingsMutationResponse,
} from '@spoh/shared';

/** Only identifiers and reviewed metadata survive a retry, never values or reasons. */
export const ScopedMutationReceipt = z
  .object({
    historyId: Id,
    key: ScopedOperationalSettingKey,
    target: ScopedSettingsTarget,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type ScopedMutationReceipt = z.infer<typeof ScopedMutationReceipt>;
export function toScopedMutationReceipt(
  response: ScopedSettingsMutationResponse,
): ScopedMutationReceipt {
  return {
    historyId: response.change.id,
    key: response.change.key,
    target: response.current.target,
    expectedVersion: response.reviewedVersion,
  };
}
