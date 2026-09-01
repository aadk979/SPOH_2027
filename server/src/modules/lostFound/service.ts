import {
  ERROR_CODES,
  type ClaimLostFoundRequest,
  type CreateLostFoundRequest,
  type ListLostFoundQuery,
  type LostFoundRecord,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Lost and found (PRODUCT_BRIEF §7.2).
 *
 * Note what this does NOT record: nothing about the person who lost the item,
 * and nothing about the person who claimed it. An item is described, a place is
 * recorded, and a claim is a status change. "Claimed by Mrs Tan" would put
 * visitor personal data into a system that deliberately holds none (§0.2).
 *
 * Slide 48 tracks lost-and-found cases as a metric. This is the first time the
 * event would actually have the number rather than somebody's recollection.
 */

interface ItemRow {
  id: string;
  itemLabel: string;
  categoryLabel: string | null;
  foundStationId: string | null;
  foundAt: Date;
  holderNote: string | null;
  photoKey: string | null;
  status: LostFoundRecord['status'];
  loggedById: string;
  claimedAt: Date | null;
  createdAt: Date;
  loggedBy: { displayName: string };
}

async function toRecord(item: ItemRow): Promise<LostFoundRecord> {
  // `foundStationId` is a plain scalar with no Prisma relation (see the note at
  // the top of schema.prisma), so the station name is resolved by hand.
  const station = item.foundStationId
    ? await prisma.station.findUnique({
        where: { id: item.foundStationId },
        select: { name: true },
      })
    : null;

  return {
    id: item.id,
    itemLabel: item.itemLabel,
    categoryLabel: item.categoryLabel,
    foundStationId: item.foundStationId,
    foundStationName: station?.name ?? null,
    foundAt: item.foundAt.toISOString(),
    holderNote: item.holderNote,
    photoKey: item.photoKey,
    status: item.status,
    loggedById: item.loggedById,
    loggedByName: item.loggedBy.displayName,
    claimedAt: item.claimedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function logItem(
  request: CreateLostFoundRequest,
  loggedById: string,
  audit: AuditContext,
): Promise<LostFoundRecord> {
  const item = await prisma.$transaction(async (tx) => {
    const row = await tx.lostFoundItem.create({
      data: {
        itemLabel: request.itemLabel,
        categoryLabel: request.categoryLabel ?? null,
        foundStationId: request.foundStationId ?? null,
        foundAt: request.foundAt ? new Date(request.foundAt) : new Date(),
        holderNote: request.holderNote ?? null,
        photoKey: request.photoKey ?? null,
        loggedById,
      },
      include: { loggedBy: { select: { displayName: true } } },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.create',
      entityType: 'LostFoundItem',
      entityId: row.id,
      after: { itemLabel: row.itemLabel, foundStationId: row.foundStationId },
    });

    return row;
  });

  return toRecord(item);
}

export async function listItems(query: ListLostFoundQuery): Promise<LostFoundRecord[]> {
  const items = await prisma.lostFoundItem.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      // Case-insensitive substring match. The desk searches for "blue bottle",
      // not for an exact label somebody typed in a hurry three hours ago.
      ...(query.q ? { itemLabel: { contains: query.q, mode: 'insensitive' } } : {}),
    },
    include: { loggedBy: { select: { displayName: true } } },
    orderBy: { foundAt: 'desc' },
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  return Promise.all(items.map(toRecord));
}

export async function claimItem(
  itemId: string,
  request: ClaimLostFoundRequest,
  audit: AuditContext,
): Promise<LostFoundRecord> {
  const claimed = await prisma.$transaction(async (tx) => {
    const existing = await tx.lostFoundItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundError('Lost and found item');

    if (existing.status === 'CLAIMED') {
      throw new AppError(
        409,
        ERROR_CODES.ITEM_ALREADY_CLAIMED,
        'That item has already been claimed',
      );
    }

    const row = await tx.lostFoundItem.update({
      where: { id: itemId },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
        // The note records where the claim happened, never who made it.
        ...(request.note ? { holderNote: request.note } : {}),
      },
      include: { loggedBy: { select: { displayName: true } } },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.claim',
      entityType: 'LostFoundItem',
      entityId: itemId,
      before: { status: existing.status },
      after: { status: 'CLAIMED' },
    });

    return row;
  });

  return toRecord(claimed);
}

/**
 * Close out everything still held at the end of the event, so the post-event
 * report can state the outcome of every case rather than leaving a pile of
 * items in an indefinite "held".
 */
export async function markUnclaimedAtClose(audit: AuditContext): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.lostFoundItem.updateMany({
      where: { status: 'HELD' },
      data: { status: 'UNCLAIMED_AT_CLOSE' },
    });

    if (count > 0) {
      await writeAudit(tx, {
        ...audit,
        action: 'lostFound.claim',
        entityType: 'LostFoundItem',
        entityId: null,
        after: { markedUnclaimedAtClose: count },
      });
    }

    return count;
  });
}
