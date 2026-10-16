import { ERROR_CODES } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { writeAudit, type AuditContext } from '../audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { systemClock, type Clock } from '../time/index.js';
interface CleanupRetryInput {
  id: string;
  apply: boolean;
  expectedVersion?: number;
  reason?: string;
  operatorReference?: string;
}
function validExplanation(value: string | undefined, maximum: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}
function validateInput(input: CleanupRetryInput): void {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(input.id))
    throw new ValidationError('A cleanup action ID is required.');
  if (!input.apply) return;
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion! < 1 ||
    !validExplanation(input.reason, 500) ||
    !validExplanation(input.operatorReference, 200)
  )
    throw new ValidationError(
      'Execution needs the reviewed version, reason and operator reference.',
    );
}
async function lockedAction(tx: PrismaTransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${id} AND "eventId" IS NULL FOR UPDATE`;
  return tx.scheduledAction.findFirst({ where: { id, eventId: null } });
}
type StoredAction = NonNullable<Awaited<ReturnType<typeof lockedAction>>>;
function assertCleanupKind(row: StoredAction | null): asserts row is StoredAction {
  if (
    !row ||
    row.type !== 'content.storage.prune' ||
    row.createdByPersonId !== null ||
    row.recurrence !== 3600 ||
    row.dedupeKey !== 'recurring:[null,"content.storage.prune"]'
  )
    throw new NotFoundError('System content-cleanup action');
}
function assertRetryEligible(
  row: StoredAction,
  input: CleanupRetryInput,
): asserts row is StoredAction & { completedAt: Date } {
  const refusal = () =>
    new ConflictError(
      ERROR_CODES.CONFLICT,
      'The cleanup action changed or is not eligible for retry.',
    );
  if (row.status !== 'DEAD' || row.attempts < row.maxAttempts) throw refusal();
  if (row.lockedBy !== null || row.lockedUntil !== null) throw refusal();
  if (
    row.completedAt === null ||
    !['EXECUTION_FAILED', 'ATTEMPTS_EXHAUSTED'].includes(row.lastError ?? '')
  )
    throw refusal();
  if (input.apply && row.version !== input.expectedVersion) throw refusal();
}
function failureMetadata(row: StoredAction & { completedAt: Date }) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    version: row.version,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    scheduledFor: (row.scheduledFor ?? row.runAt).toISOString(),
    runAt: row.runAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  };
}
interface RetryContext {
  request: CleanupRetryInput;
  now: Date;
  audit: AuditContext;
}
async function queueRetry(
  tx: PrismaTransactionClient,
  row: StoredAction & { completedAt: Date },
  context: RetryContext,
) {
  const { request: input, now, audit } = context;
  const updated = await tx.scheduledAction.update({
    where: { id: row.id, eventId: null, status: 'DEAD', version: input.expectedVersion },
    data: {
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      completedAt: null,
      runAt: now,
      version: { increment: 1 },
    },
  });
  await writeAudit(tx, {
    ...audit,
    eventId: null,
    membershipId: null,
    action: 'schedule.retry',
    entityType: 'ScheduledAction',
    entityId: row.id,
    severity: 'WARNING',
    before: failureMetadata(row),
    after: {
      status: updated.status,
      version: updated.version,
      attempts: 0,
      reason: input.reason!,
      operatorReference: input.operatorReference!,
    },
  });
  return {
    dryRun: false,
    action: {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      version: updated.version,
      attempts: updated.attempts,
    },
  };
}
/** Operator-only application command. No HTTP route; never resets a job at startup. */
export async function retryContentCleanup(
  input: CleanupRetryInput,
  options: { clock?: Clock; audit: AuditContext },
) {
  validateInput(input);
  return prisma.$transaction(
    async (tx) => {
      const row = await lockedAction(tx, input.id);
      assertCleanupKind(row);
      assertRetryEligible(row, input);
      if (!input.apply) return { dryRun: true, action: failureMetadata(row) };
      return queueRetry(tx, row, {
        request: input,
        now: (options.clock ?? systemClock).now(),
        audit: options.audit,
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 15_000 },
  );
}
