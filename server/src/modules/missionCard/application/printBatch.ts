import { randomUUID } from 'node:crypto';
import { CardPrintExportRecord, ERROR_CODES, type PrintCardBatchRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { listStampingStations } from '../../station/index.js';
import {
  findPrintExport,
  lockPrintableCards,
  printableCards,
  printEventName,
  savePrintExport,
} from '../data/printRepo.js';
import type { CardPrintContext } from '../domain/printContext.js';
import { cardPrintStorage } from './printStorage.js';
import { renderCardPdf, renderCardZip } from './renderCards.js';

type PrintActor = ActorContext & { clock?: Clock };
type Cards = Awaited<ReturnType<typeof printableCards>>;
type PrintWork = {
  actor: PrintActor;
  request: PrintCardBatchRequest;
  cards: Cards;
  context: CardPrintContext;
};

async function holdPrintAuthority(tx: PrismaTransactionClient, actor: PrintActor, key: string) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    action: 'Card.GenerateBatch',
  });
  if (event.status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived events cannot create print exports.');
  await lockReserved(tx, actor.scope, key);
}

function assertPrintableCards(cards: Cards, request: PrintCardBatchRequest) {
  if (cards.length !== request.shortCodes.length) throw new NotFoundError('Card in this event');
  if (cards.some((card) => card.status !== 'UNISSUED'))
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Only unused cards can be printed. Generate fresh cards for a new print run.',
    );
  if (cards.some((card) => card.rehearsal !== cards[0]!.rehearsal))
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Choose either live or rehearsal cards for one print run.',
    );
}

async function frozenPrintContext(
  tx: PrismaTransactionClient,
  scope: EventScope,
  cards: Cards,
): Promise<CardPrintContext> {
  const { name } = await printEventName(scope, tx);
  const stations = await listStampingStations(scope, tx);
  return {
    eventName: name,
    stampingStations: stations.map(({ id, name }) => ({ id, name })),
    batches: cards.map(({ shortCode, batchLabel }) => ({ shortCode, batchLabel })),
  };
}

async function storePrintExport(tx: PrismaTransactionClient, work: PrintWork) {
  const { request, actor, cards, context: printContext } = work;
  const id = randomUUID();
  const objectKey = `card-print/${actor.scope.eventId}/${id}.${request.format}`;
  const body = await (request.format === 'pdf'
    ? renderCardPdf(cards, printContext)
    : renderCardZip(cards, printContext));
  // S3 cannot share the SQL commit. A later rollback leaves an inaccessible private object
  // until the existing 90-day exports lifecycle removes it; never overwrite it on retry.
  await cardPrintStorage().write({
    key: objectKey,
    body,
    contentType: printContentType(request.format),
  });
  return savePrintExport(actor.scope, tx, {
    id,
    objectKey,
    format: request.format,
    count: cards.length,
    rehearsal: cards[0]!.rehearsal,
    createdAt: (actor.clock ?? systemClock).now(),
    shortCodes: cards.map((card) => card.shortCode),
    printContext,
  });
}

async function commitPrintReceipt(tx: PrismaTransactionClient, work: PrintWork) {
  const row = await storePrintExport(tx, work);
  await writeAudit(tx, {
    ...work.actor.audit,
    action: 'card.print',
    entityType: 'CardPrintExport',
    entityId: row.id,
    after: { count: row.count, format: row.format, rehearsal: row.rehearsal },
  });
  const response = {
    data: CardPrintExportRecord.parse({
      id: row.id,
      format: row.format,
      count: row.count,
      rehearsal: row.rehearsal,
      createdAt: row.createdAt.toISOString(),
    }),
  };
  await settleReserved(tx, work.actor.scope, {
    key: work.request.idempotencyKey,
    statusCode: 201,
    body: response,
  });
  return response;
}

export function printCardBatch(request: PrintCardBatchRequest, actor: PrintActor) {
  return prisma.$transaction(
    async (tx) => {
      await holdPrintAuthority(tx, actor, request.idempotencyKey);
      await lockPrintableCards(actor.scope, request.shortCodes, tx);
      const cards = await printableCards(actor.scope, request.shortCodes, tx);
      assertPrintableCards(cards, request);
      const context = await frozenPrintContext(tx, actor.scope, cards);
      return commitPrintReceipt(tx, { request, actor, cards, context });
    },
    { timeout: 120_000 },
  );
}

export const printContentType = (format: string) =>
  format === 'pdf' ? 'application/pdf' : 'application/zip';
export async function downloadCardPrint(scope: EventScope, id: string) {
  const row = await findPrintExport(scope, id);
  if (!row) throw new NotFoundError('Card print export');
  return {
    body: await cardPrintStorage().read(row.objectKey),
    contentType: printContentType(row.format),
    fileName: `cards-${row.id}.${row.format}`,
  };
}
