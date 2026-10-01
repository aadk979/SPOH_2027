import type { VisitorValues } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventSetting } from '../../../platform/settings/eventSettings.js';
import { createVisitorRecord, listFieldRows, lockVisitorEvent } from '../data/repo.js';
import { acceptedValues, assertAllowlist } from '../domain/visitorRules.js';

/**
 * Keep a registration's declared visitor values, in its transaction, in the
 * visitor record and nowhere else (ADR-002 §4). Refused unless the event is
 * in allowlist mode and every value fits a declared field.
 */
export async function recordVisitorValues(
  tx: PrismaTransactionClient,
  scope: EventScope,
  capture: { registrationId: string; values: VisitorValues },
): Promise<void> {
  await lockVisitorEvent(tx, scope);
  assertAllowlist(await eventSetting(scope, 'product.visitorDataMode', tx));
  const data = acceptedValues(await listFieldRows(scope, tx), capture.values);
  if (Object.keys(data).length === 0) return;
  await createVisitorRecord(tx, scope, { registrationId: capture.registrationId, data });
}
