import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { supportedCaptureIntent } from '../data/captureScheduleMapper.js';
import { findCaptureCreationAudit, type CaptureScheduleRow } from '../data/captureScheduleRepo.js';
import { holdScopedMutationStation } from '../data/scopedMutationRepo.js';

export async function requireCaptureSchedule(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; row: CaptureScheduleRow | null },
) {
  const { scope, row } = input;
  if (!row?.createdByPersonId) throw new NotFoundError('Capture schedule');
  const audit = await findCaptureCreationAudit(tx, scope, {
    id: row.id,
    personId: row.createdByPersonId,
  });
  const intent = supportedCaptureIntent(row, audit?.after);
  if (!intent) throw new NotFoundError('Capture schedule');
  if (
    intent.target.scope === 'station' &&
    !(await holdScopedMutationStation(tx, scope, intent.target.stationId))
  )
    throw new NotFoundError('Station');
  return { row, intent, original: audit!.after };
}
