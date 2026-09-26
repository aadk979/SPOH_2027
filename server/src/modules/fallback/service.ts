import { createHash } from 'node:crypto';
import {
  ERROR_CODES,
  type CloseFallbackRequest,
  type DeclareFallbackRequest,
  type FallbackWindowRecord,
  type ImportFootfallRequest,
  type ImportIssue,
  type ImportRegistrationsRequest,
  type ImportResponse,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';
import { minutesBetween } from '../../lib/time.js';

/**
 * Fallback windows and reconciliation (PRODUCT_BRIEF §11).
 *
 * Two rules govern everything here.
 *
 * **Declaring a tier is a command decision.** Only a Deputy Coordinator or the
 * Chief may declare or close one. Individual volunteers deciding to switch
 * systems is how the same visitor ends up counted in three places.
 *
 * **Never silently blend sources.** Every imported record is tagged
 * FALLBACK_SHEET or PAPER, keeps its original timestamp where one was recorded
 * and a coarse time block where it was not, and every summary that overlaps a
 * window says so. A report that quietly mixes app data and paper estimates is
 * worse than one that says which hour is approximate.
 */

interface WindowRow {
  id: string;
  tier: number;
  startedAt: Date;
  endedAt: Date | null;
  stationId: string | null;
  declaredById: string;
  reason: string;
}

async function toRecord(window: WindowRow): Promise<FallbackWindowRecord> {
  // `declaredById` and `stationId` are plain scalars with no Prisma relation
  // (see the note at the top of schema.prisma), so they are resolved by hand.
  const [declaredBy, station] = await Promise.all([
    prisma.volunteer.findUnique({
      where: { id: window.declaredById },
      select: { displayName: true },
    }),
    window.stationId
      ? prisma.station.findUnique({ where: { id: window.stationId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  return {
    id: window.id,
    tier: window.tier,
    startedAt: window.startedAt.toISOString(),
    endedAt: window.endedAt?.toISOString() ?? null,
    stationId: window.stationId,
    stationName: station?.name ?? null,
    declaredById: window.declaredById,
    declaredByName: declaredBy?.displayName ?? 'Unknown',
    reason: window.reason,
    open: window.endedAt === null,
    durationMinutes: window.endedAt ? minutesBetween(window.startedAt, window.endedAt) : null,
  };
}

export async function declareFallback(
  request: DeclareFallbackRequest,
  declaredById: string,
  audit: AuditContext,
): Promise<FallbackWindowRecord> {
  const stationId = request.stationId ?? null;

  const window = await prisma.$transaction(async (tx) => {
    // One open window per scope. A second declaration for the same station
    // would make "was this hour degraded" ambiguous, which is the one question
    // the window exists to answer.
    const existing = await tx.fallbackWindow.findFirst({
      where: { endedAt: null, stationId },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(
        409,
        ERROR_CODES.FALLBACK_ALREADY_OPEN,
        stationId
          ? 'A fallback window is already open for that station'
          : 'An event-wide fallback window is already open',
      );
    }

    const row = await tx.fallbackWindow.create({
      data: {
        tier: request.tier,
        // Degraded operation usually started a few minutes before anybody
        // declared it, so the caller can backdate.
        startedAt: request.startedAt ? new Date(request.startedAt) : new Date(),
        stationId,
        declaredById,
        reason: request.reason,
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'fallback.declare',
      entityType: 'FallbackWindow',
      entityId: row.id,
      after: { tier: row.tier, stationId, reason: row.reason },
    });

    return row;
  });

  logger.warn(
    { fallbackWindowId: window.id, tier: window.tier, stationId },
    'FALLBACK DECLARED — announce it in the Safety Communications Chat',
  );

  return toRecord(window);
}

export async function closeFallback(
  windowId: string,
  request: CloseFallbackRequest,
  audit: AuditContext,
): Promise<FallbackWindowRecord> {
  const closed = await prisma.$transaction(async (tx) => {
    const existing = await tx.fallbackWindow.findUnique({ where: { id: windowId } });
    if (!existing) throw new NotFoundError('Fallback window');

    if (existing.endedAt) {
      throw new AppError(
        409,
        ERROR_CODES.FALLBACK_ALREADY_CLOSED,
        'That fallback window is already closed',
      );
    }

    const endedAt = request.endedAt ? new Date(request.endedAt) : new Date();

    if (endedAt < existing.startedAt) {
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        'A fallback window cannot end before it started',
      );
    }

    const row = await tx.fallbackWindow.update({ where: { id: windowId }, data: { endedAt } });

    await writeAudit(tx, {
      ...audit,
      action: 'fallback.close',
      entityType: 'FallbackWindow',
      entityId: windowId,
      before: { endedAt: null },
      after: {
        endedAt: endedAt.toISOString(),
        durationMinutes: minutesBetween(existing.startedAt, endedAt),
        note: request.note ?? null,
      },
    });

    return row;
  });

  return toRecord(closed);
}

export async function listFallbackWindows(range: {
  from?: Date;
  to?: Date;
}): Promise<FallbackWindowRecord[]> {
  const windows = await prisma.fallbackWindow.findMany({
    where: {
      ...(range.to ? { startedAt: { lt: range.to } } : {}),
      ...(range.from ? { OR: [{ endedAt: null }, { endedAt: { gt: range.from } }] } : {}),
    },
    orderBy: { startedAt: 'asc' },
  });

  return Promise.all(windows.map(toRecord));
}

/**
 * A stable idempotency key for an imported row.
 *
 * Derived from the content rather than generated, so re-running the same import
 * after a partial failure creates nothing new. Reconciliation happens under
 * time pressure with a named owner, and "run it again" has to be safe.
 *
 * The row number is part of the key (F03-012). Two volunteers' sheets for the
 * same desk, category and half hour are two rows with the same content, and
 * both are real: keyed by content alone, the second was "skipped" as a
 * duplicate of the first and its tally disappeared.
 */
function importKey(source: string, batchScope: string, parts: readonly unknown[]): string {
  const digest = createHash('sha256')
    .update([source, batchScope, ...parts.map(String)].join('|'))
    .digest('hex')
    .slice(0, 40);

  return `import:${digest}`;
}

interface ImportContext {
  actorId: string;
  audit: AuditContext;
}

export async function importRegistrations(
  request: ImportRegistrationsRequest,
  context: ImportContext,
): Promise<ImportResponse> {
  return runImport({
    source: request.source,
    commit: request.commit,
    rowCount: request.rows.length,
    targetTable: 'Registration',
    fileName: request.fileName ?? null,
    notes: request.notes ?? null,
    context,
    apply: async (tx, issues) => {
      const stations = await stationCodeMap(tx);
      let created = 0;
      let skipped = 0;

      for (const [index, row] of request.rows.entries()) {
        const rowNumber = index + 1;
        const stationId = stations.get(row.stationCode.toUpperCase());

        if (!stationId) {
          issues.push({
            rowNumber,
            field: 'stationCode',
            message: `Unknown station code ${row.stationCode}`,
          });
          continue;
        }

        const recordedAt = new Date(row.recordedAt ?? (row.timeBlockStart as string));

        // A paper tally of twelve is twelve rows, because a registration is one
        // person and the table has no quantity column — the count in the
        // request is a transcription convenience, not a data shape.
        for (let occurrence = 0; occurrence < row.count; occurrence += 1) {
          const key = importKey(request.source, request.fileName ?? 'manual', [
            rowNumber,
            row.stationCode,
            row.category,
            recordedAt.toISOString(),
            occurrence,
          ]);

          const existing = await tx.registration.findUnique({
            where: { idempotencyKey: key },
            select: { id: true },
          });

          if (existing) {
            skipped += 1;
            continue;
          }

          await tx.registration.create({
            data: {
              category: row.category,
              stationId,
              recordedById: context.actorId,
              // Source-tagged, so no report can mistake this for an app tap.
              source: request.source,
              recordedAt,
              idempotencyKey: key,
            },
          });

          created += 1;
        }
      }

      return { created, skipped };
    },
  });
}

export async function importFootfall(
  request: ImportFootfallRequest,
  context: ImportContext,
): Promise<ImportResponse> {
  return runImport({
    source: request.source,
    commit: request.commit,
    rowCount: request.rows.length,
    targetTable: 'FootfallTick',
    fileName: request.fileName ?? null,
    notes: request.notes ?? null,
    context,
    apply: async (tx, issues) => {
      const stations = await stationCodeMap(tx);
      let created = 0;
      let skipped = 0;

      for (const [index, row] of request.rows.entries()) {
        const rowNumber = index + 1;
        const stationId = stations.get(row.stationCode.toUpperCase());

        if (!stationId) {
          issues.push({
            rowNumber,
            field: 'stationCode',
            message: `Unknown station code ${row.stationCode}`,
          });
          continue;
        }

        const timeBlockStart = new Date(row.timeBlockStart);

        const key = importKey(request.source, request.fileName ?? 'manual', [
          rowNumber,
          row.stationCode,
          timeBlockStart.toISOString(),
        ]);

        const existing = await tx.footfallTick.findUnique({
          where: { idempotencyKey: key },
          select: { id: true },
        });

        if (existing) {
          skipped += 1;
          continue;
        }

        await tx.footfallTick.create({
          data: {
            stationId,
            recordedById: context.actorId,
            // A block total is one row with a quantity. Splitting it into
            // individual ticks would invent a precision the tally never had.
            quantity: row.quantity,
            source: request.source,
            recordedAt: timeBlockStart,
            timeBlockStart,
            idempotencyKey: key,
          },
        });

        created += 1;
      }

      return { created, skipped };
    },
  });
}

async function stationCodeMap(tx: PrismaTransactionClient): Promise<Map<string, string>> {
  const stations = await tx.station.findMany({ select: { id: true, code: true } });
  return new Map(stations.map((station) => [station.code.toUpperCase(), station.id]));
}

/** Sentinel used to roll back a dry run. Never surfaces to a caller. */
class DryRunRollback extends Error {
  constructor(readonly result: { created: number; skipped: number; issues: ImportIssue[] }) {
    super('import dry run');
    this.name = 'DryRunRollback';
  }
}

/**
 * The shared import shell: dry run by default, one transaction on commit.
 *
 * A dry run applies everything inside a transaction that is then deliberately
 * rolled back, so the preview reflects what would really happen — including
 * constraint violations — without writing anything.
 */
async function runImport(input: {
  source: 'FALLBACK_SHEET' | 'PAPER';
  commit: boolean;
  rowCount: number;
  targetTable: string;
  fileName: string | null;
  notes: string | null;
  context: ImportContext;
  apply(
    tx: PrismaTransactionClient,
    issues: ImportIssue[],
  ): Promise<{ created: number; skipped: number }>;
}): Promise<ImportResponse> {
  const issues: ImportIssue[] = [];
  let created = 0;
  let skipped = 0;
  let importBatchId: string | null = null;

  const run = async (tx: PrismaTransactionClient): Promise<void> => {
    const result = await input.apply(tx, issues);
    created = result.created;
    skipped = result.skipped;
  };

  if (input.commit) {
    await prisma.$transaction(async (tx) => {
      await run(tx);

      const batch = await tx.importBatch.create({
        data: {
          source: input.source,
          targetTable: input.targetTable,
          rowCount: created,
          fileName: input.fileName,
          importedById: input.context.actorId,
          notes: input.notes,
        },
      });

      importBatchId = batch.id;

      await writeAudit(tx, {
        ...input.context.audit,
        action: 'import.run',
        entityType: 'ImportBatch',
        entityId: batch.id,
        after: {
          source: input.source,
          targetTable: input.targetTable,
          rowsRead: input.rowCount,
          created,
          skipped,
          issues: issues.length,
        },
      });
    });
  } else {
    await prisma
      .$transaction(async (tx) => {
        await run(tx);
        throw new DryRunRollback({ created, skipped, issues });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DryRunRollback)) throw error;
      });
  }

  return {
    committed: input.commit,
    source: input.source,
    rowsRead: input.rowCount,
    recordsCreated: created,
    recordsSkipped: skipped,
    issues,
    importBatchId,
  };
}
