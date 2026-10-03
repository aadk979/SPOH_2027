import { z } from 'zod';
import { Id, EventSettingKey, type RevertEventSettingResponse } from '@spoh/shared';

/** Replay retains bounded identifiers and the reviewed version, never values or reasons. */
export const EventSettingRevertReceipt = z
  .object({
    historyId: Id,
    targetHistoryId: Id,
    key: EventSettingKey,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type EventSettingRevertReceipt = z.infer<typeof EventSettingRevertReceipt>;
export function toRevertReceipt(response: RevertEventSettingResponse): EventSettingRevertReceipt {
  return {
    historyId: response.history.id,
    targetHistoryId: response.revertedFrom.historyId,
    key: response.history.key,
    expectedVersion: response.reviewedVersion,
  };
}
