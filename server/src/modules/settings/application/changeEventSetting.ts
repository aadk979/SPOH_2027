import {
  ERROR_CODES,
  type ChangeEventSettingRequest,
  type EventSettingKey,
  type EventSettings,
  type EventSettingsResponse,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError, RuleError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventSettings } from '../../../platform/settings/eventSettings.js';
import { EVENT_SETTINGS } from '../../../platform/settings/registry.js';
import { lockVisitorEvent, purgeAllVisitorRecords } from '../../visitor/index.js';
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

/** The change's history row and audit entry, beside the write (ADR-003 §2). */
async function recordChange(
  tx: PrismaTransactionClient,
  actor: ActorContext,
  change: {
    key: ChangeEventSettingRequest['key'];
    before: EventSettings[EventSettingKey];
    after: EventSettings[EventSettingKey];
    version: number;
    reason: string | null;
    purged: number | null;
  },
): Promise<void> {
  const { key, before, after, version, reason, purged } = change;
  const personId = actor.volunteerId;
  await appendSettingChange(tx, actor.scope, { key, version, before, after, reason, personId });
  await writeAudit(tx, {
    ...actor.audit,
    action: 'setting.change',
    entityType: 'Setting',
    entityId: key,
    before: { value: before },
    after: {
      value: after,
      version,
      ...(reason ? { reason } : {}),
      ...(purged !== null ? { visitorRecordsPurged: purged } : {}),
    },
  });
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
    if (change.key === 'product.visitorDataMode') await lockVisitorEvent(tx, scope);
    const status = await eventStatusOf(tx, scope);
    const current = await eventSettings(scope, tx);
    const readVersion = current.versions[change.key];
    assertUnlocked(EVENT_SETTINGS[change.key], status);
    assertReadVersion(readVersion, change.expectedVersion);
    assertVisitorDataChange(change, current.settings, status);
    await assertHeadlineSource(tx, scope, change);
    const { key, value } = change;
    const personId = actor.volunteerId;
    // Another writer committed between this read and this write.
    assertWritten(await writeEventSetting(tx, scope, { key, value, readVersion, personId }));
    const before = current.settings[key];
    // Switching visitor data off removes every record first (ADR-002 §4).
    const purged =
      key === 'product.visitorDataMode' && before === 'allowlist' && value === 'none'
        ? await purgeAllVisitorRecords(tx, scope)
        : null;
    const reason = change.reason ?? null;
    await recordChange(tx, actor, {
      key,
      before,
      after: value,
      version: readVersion + 1,
      reason,
      purged,
    });
  });
  return eventSettings(scope);
}
