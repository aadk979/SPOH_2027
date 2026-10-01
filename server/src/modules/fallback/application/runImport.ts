import type { ImportResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { createImportBatch } from '../data/repo.js';
import type { ImportPlan } from '../domain/importPlan.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { assertImportProvenance, type ImportProvenance } from './importProvenance.js';

interface ImportInput<T> {
  source: 'FALLBACK_SHEET' | 'PAPER';
  commit: boolean;
  rowCount: number;
  targetTable: string;
  fileName: string | null;
  notes: string | null;
  plan: ImportPlan<T>;
  provenance: ImportProvenance;
  insert(tx: PrismaTransactionClient, scope: EventScope, records: T[]): Promise<number>;
}

interface Outcome {
  created: number;
  skipped: number;
  importBatchId: string | null;
}

/**
 * The shared import shell: a preview is the plan, a commit applies it in one
 * transaction with its ImportBatch and audit row — the same plan/apply shape
 * as the roster import.
 */
export async function runImport<T>(
  input: ImportInput<T>,
  actor: ActorContext,
): Promise<ImportResponse> {
  const outcome: Outcome = input.commit
    ? await applyPlan(input, actor)
    : { created: input.plan.creates.length, skipped: input.plan.skipped, importBatchId: null };

  return {
    committed: input.commit,
    source: input.source,
    rowsRead: input.rowCount,
    recordsCreated: outcome.created,
    recordsSkipped: outcome.skipped,
    issues: input.plan.issues,
    importBatchId: outcome.importBatchId,
    rehearsal: input.provenance.rehearsal,
  };
}

/**
 * Write the plan, its ImportBatch and its audit row in one transaction. Rows
 * another import wrote since the plan was made are skipped by the insert
 * rather than written twice, and counted as skipped.
 */
async function applyPlan<T>(
  input: ImportInput<T>,
  { volunteerId, membershipId, scope, audit }: ActorContext,
): Promise<Outcome> {
  const { plan } = input;
  return prisma.$transaction(async (tx) => {
    await assertImportProvenance(tx, scope, input.provenance);
    const created = await input.insert(
      tx,
      scope,
      plan.creates.map((keyed) => keyed.record),
    );
    const skipped = plan.skipped + (plan.creates.length - created);

    const batch = await createImportBatch(tx, scope, {
      source: input.source,
      targetTable: input.targetTable,
      rowCount: created,
      fileName: input.fileName,
      importedById: volunteerId,
      importedByMembershipId: membershipId,
      notes: input.notes,
      rehearsal: input.provenance.rehearsal,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'import.run',
      entityType: 'ImportBatch',
      entityId: batch.id,
      after: {
        source: input.source,
        rehearsal: input.provenance.rehearsal,
        fallbackWindowId: input.provenance.fallbackWindowId ?? null,
        targetTable: input.targetTable,
        rowsRead: input.rowCount,
        created,
        skipped,
        issues: plan.issues.length,
      },
    });

    return { created, skipped, importBatchId: batch.id };
  });
}
