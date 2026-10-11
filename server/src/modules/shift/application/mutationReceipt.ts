import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';

export async function holdShiftReceipt(
  tx: PrismaTransactionClient,
  scope: EventScope,
  key: string | undefined,
) {
  if (key) await lockReserved(tx, scope, key);
}
export async function settleShiftReceipt(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { key: string | undefined; id: string; statusCode: number },
) {
  if (input.key)
    await settleReserved(tx, scope, {
      key: input.key,
      statusCode: input.statusCode,
      body: { id: input.id },
    });
}
