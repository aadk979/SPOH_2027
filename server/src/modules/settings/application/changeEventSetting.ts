import {
  ERROR_CODES,
  type ChangeEventSettingRequest,
  type EventSettingsResponse,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError, RuleError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventSettings } from '../../../platform/settings/eventSettings.js';
import { EVENT_SETTINGS } from '../../../platform/settings/registry.js';
import {
  appendSettingChange,
  eventStatusOf,
  findStationCounting,
  writeEventSetting,
} from '../data/repo.js';
import {
  assertReadVersion,
  assertUnlocked,
  assertVisitorDataChange,
  assertWritten,
} from '../domain/eventSettingRules.js';

/** A footfall headline must name a station of the event that counts entries. */
async function assertHeadlineSource(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: ChangeEventSettingRequest,
): Promise<void> {
  if (change.key !== 'product.countsMode' || change.value.mode !== 'headline') return;
  const { source } = change.value;
  if (source.count !== 'footfall') return;
  const station = await findStationCounting(tx, scope, source.stationId);
  if (!station) throw new NotFoundError('Station');
  if (!station.countsEntry) {
    throw new RuleError(
      ERROR_CODES.STATION_DOES_NOT_COUNT_ENTRY,
      'A footfall headline needs a station that counts entries.',
    );
  }
}

/**
 * Change one event setting (ADR-003 §2): checked against the event's state
 * and the version the caller read, stored as the next version, with its
 * history row and audit entry, in one transaction.
 */
export async function changeEventSetting(
  change: ChangeEventSettingRequest,
  actor: ActorContext,
): Promise<EventSettingsResponse> {
  const { scope } = actor;
  await prisma.$transaction(async (tx) => {
    const status = await eventStatusOf(tx, scope);
    const current = await eventSettings(scope, tx);
    const readVersion = current.versions[change.key];
    assertUnlocked(EVENT_SETTINGS[change.key], status);
    assertReadVersion(readVersion, change.expectedVersion);
    assertVisitorDataChange(change, current.settings, status);
    await assertHeadlineSource(tx, scope, change);
    const { key, value } = change;
    const written = await writeEventSetting(tx, scope, {
      key,
      value,
      readVersion,
      personId: actor.volunteerId,
    });
    // Another writer committed between this read and this write.
    assertWritten(written);
    const before = current.settings[key];
    const version = readVersion + 1;
    const reason = change.reason ?? null;
    await appendSettingChange(tx, scope, {
      key,
      version,
      before,
      after: value,
      reason,
      personId: actor.volunteerId,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'setting.change',
      entityType: 'Setting',
      entityId: key,
      before: { value: before },
      after: { value, version, ...(reason ? { reason } : {}) },
    });
  });
  return eventSettings(scope);
}
