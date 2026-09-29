import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { pageArgs, type PageRequest } from '../../../platform/db/pagination.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

/**
 * Data access for lost and found (PRODUCT_BRIEF §7.2). An item is described, a
 * place is recorded, and a claim is a status change: nothing here holds the
 * person who lost or claimed it (§0.2).
 */

const itemInclude = {
  loggedBy: { select: { displayName: true } },
} satisfies Prisma.LostFoundItemInclude;

export type ItemWithContext = Prisma.LostFoundItemGetPayload<{ include: typeof itemInclude }>;

export async function createItem(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.LostFoundItemUncheckedCreateInput, 'eventId'>,
): Promise<ItemWithContext> {
  return tx.lostFoundItem.create({
    data: {
      ...data,
      eventId: scope.eventId,
      loggedByMembershipId: await membershipIdOf(tx, scope, data.loggedById),
    },
    include: itemInclude,
  });
}

export async function findItemRow(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.lostFoundItem.findUnique({ where: { id, eventId: scope.eventId } });
}

export interface ItemFilter extends PageRequest {
  status?: Prisma.LostFoundItemWhereInput['status'];
  q?: string;
}

export async function listItemRows(
  scope: EventScope,
  filter: ItemFilter,
): Promise<ItemWithContext[]> {
  return prisma.lostFoundItem.findMany({
    where: {
      eventId: scope.eventId,
      ...(filter.status ? { status: filter.status } : {}),
      // Case-insensitive substring match. The desk searches for "blue bottle",
      // not for an exact label somebody typed in a hurry three hours ago.
      ...(filter.q ? { itemLabel: { contains: filter.q, mode: 'insensitive' } } : {}),
    },
    include: itemInclude,
    orderBy: [{ foundAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(filter),
  });
}

export async function markClaimed(
  tx: PrismaTransactionClient,
  scope: EventScope,
  claim: { id: string; at: Date; note: string | undefined },
): Promise<ItemWithContext> {
  return tx.lostFoundItem.update({
    where: { id: claim.id, eventId: scope.eventId },
    data: {
      status: 'CLAIMED',
      claimedAt: claim.at,
      // The note records where the claim happened, never who made it.
      ...(claim.note ? { holderNote: claim.note } : {}),
    },
    include: itemInclude,
  });
}

/** Everything still held becomes UNCLAIMED_AT_CLOSE. Returns how many. */
export async function markHeldUnclaimed(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<number> {
  const { count } = await tx.lostFoundItem.updateMany({
    where: { eventId: scope.eventId, status: 'HELD' },
    data: { status: 'UNCLAIMED_AT_CLOSE' },
  });
  return count;
}
