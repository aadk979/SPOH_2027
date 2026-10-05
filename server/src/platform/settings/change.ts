import { ERROR_CODES } from '@spoh/shared';
import { holdCaptureEvent } from '../db/captureProvenance.js';
import { writeAudit, type AuditContext } from '../audit/index.js';
import {
  dbNull,
  jsonNull,
  prisma,
  type JsonValue,
  type PrismaTransactionClient,
} from '../db/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { publishCacheEvent } from '../events/cacheBus.js';
import { invalidateRateLimitPolicy } from '../http/rateLimitPolicy.js';
import { SETTINGS, type SettingKey } from './registry.js';
import { settingAuditValue } from './auditValue.js';
import { settingChangeBefore } from './changeBefore.js';
import { assertSettingTarget, scopeOf, storedSetting, type SettingTarget } from './scopedStore.js';

export type SettingChangeSource = 'USER' | 'SCHEDULE' | 'REVERT' | 'RESET' | 'CLONE';

export interface ChangeSettingInput {
  target: SettingTarget;
  key: SettingKey;
  value: unknown;
  expectedVersion: number;
  actorPersonId: string | null;
  audit: AuditContext;
  reason?: string;
  source?: SettingChangeSource;
  scheduledActionId?: string;
  /** Internal restore provenance, derived only from owned immutable history. */
  revertedFrom?: { historyId: string; version: number };
}

function versionConflict(): ConflictError {
  return new ConflictError(
    ERROR_CODES.SETTING_VERSION_CONFLICT,
    'Someone changed this setting since you opened it. Reload and decide again.',
  );
}

async function assertUnlocked(
  tx: PrismaTransactionClient,
  target: SettingTarget,
  key: SettingKey,
): Promise<void> {
  if (target.scope === 'platform') return;
  // Capture holds a share lock: policy changes wait for admitted writes, then exclude new ones.
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${target.eventId} FOR UPDATE`;
  const event = await holdCaptureEvent(tx, target);
  if (SETTINGS[key].lockedIn.includes(event.status)) {
    throw new ConflictError(
      ERROR_CODES.SETTING_LOCKED,
      `${SETTINGS[key].label} cannot change while the event is ${event.status.toLowerCase()}.`,
    );
  }
}

/** The root must be an active admin membership of this very event. */
async function assertAttendanceRoot(
  tx: PrismaTransactionClient,
  input: Pick<ChangeSettingInput, 'target' | 'key'>,
  value: unknown,
): Promise<void> {
  if (input.key !== 'attendance.rootMembershipId' || value === null) return;
  if (input.target.scope !== 'event' || typeof value !== 'string') {
    throw new ValidationError('Attendance root requires an event member');
  }
  const member = await tx.eventMembership.findFirst({
    where: {
      id: value,
      eventId: input.target.eventId,
      status: 'ACTIVE',
      role: 'ADMIN',
    },
    select: { id: true },
  });
  if (!member) throw new ValidationError('Choose an active admin from this event');
}

async function nextVersion(
  tx: PrismaTransactionClient,
  request: { target: SettingTarget; key: SettingKey; currentVersion: number },
): Promise<number> {
  const { target, key, currentVersion } = request;
  const { scope, scopeId, eventId } = scopeOf(target);
  const latest = await tx.settingChange.findFirst({
    where: { scope, scopeId, eventId, key },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return Math.max(currentVersion, latest?.version ?? 0) + 1;
}

async function writeVersion(
  tx: PrismaTransactionClient,
  input: ChangeSettingInput,
  version: number,
): Promise<void> {
  const { scope, scopeId, eventId } = scopeOf(input.target);
  const value = (input.value === null ? jsonNull : input.value) as JsonValue;
  if (input.expectedVersion === 0) {
    const created = await tx.setting.createMany({
      data: [
        {
          scope,
          scopeId,
          eventId,
          key: input.key,
          value,
          version,
          updatedByPersonId: input.actorPersonId,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count !== 1) throw versionConflict();
    return;
  }
  const updated = await tx.setting.updateMany({
    where: { scope, scopeId, eventId, key: input.key, version: input.expectedVersion },
    data: { value, version, updatedByPersonId: input.actorPersonId },
  });
  if (updated.count !== 1) throw versionConflict();
}

async function recordChange(
  tx: PrismaTransactionClient,
  change: { input: ChangeSettingInput; before: unknown; version: number },
): Promise<void> {
  const { input, before, version } = change;
  const { scope, scopeId, eventId } = scopeOf(input.target);
  const after = input.value === null ? jsonNull : input.value;
  const auditBefore = settingAuditValue(input.key, before);
  const auditAfter = settingAuditValue(input.key, input.value);
  await tx.settingChange.create({
    data: {
      scope,
      scopeId,
      eventId,
      key: input.key,
      version,
      before: (before === null ? jsonNull : before) as JsonValue,
      after: after as JsonValue,
      reason: input.reason ?? null,
      source: input.source ?? 'USER',
      actorPersonId: input.actorPersonId,
      scheduledActionId: input.scheduledActionId ?? null,
    },
  });
  await writeAudit(tx, {
    ...input.audit,
    eventId,
    action: 'setting.change',
    entityType: 'Setting',
    entityId: input.key,
    before: { scope, scopeId, value: auditBefore } as JsonValue,
    after: {
      scope,
      scopeId,
      value: auditAfter,
      version,
      source: input.source ?? 'USER',
      ...(input.revertedFrom ? { revertedFrom: input.revertedFrom } : {}),
    } as JsonValue,
  });
}

/** The scheduler supplies its transaction so the setting and completion cannot split. */
export async function changeSettingInTransaction(
  tx: PrismaTransactionClient,
  input: ChangeSettingInput,
): Promise<number> {
  const definition = SETTINGS[input.key];
  if (!definition.scopes.includes(input.target.scope)) {
    throw new ValidationError(`${input.key} cannot be set at ${input.target.scope} scope`);
  }
  const parsed = definition.schema.safeParse(input.value);
  if (!parsed.success) throw new ValidationError('Invalid setting value', parsed.error.issues);
  await assertSettingTarget(tx, input.target);
  await assertUnlocked(tx, input.target, input.key);
  await assertAttendanceRoot(tx, input, parsed.data);
  const current = await storedSetting(input.target, input.key, tx);
  if ((current?.version ?? 0) !== input.expectedVersion) throw versionConflict();
  const version = await nextVersion(tx, {
    target: input.target,
    key: input.key,
    currentVersion: current?.version ?? 0,
  });
  const changed = { ...input, value: parsed.data };
  const before = await settingChangeBefore(tx, {
    target: input.target,
    key: input.key,
    stored: current,
  });
  await writeVersion(tx, changed, version);
  await recordChange(tx, {
    input: changed,
    before,
    version,
  });
  await publishCacheEvent(tx, 'settings', {
    scope: input.target.scope,
    scopeId: scopeOf(input.target).scopeId,
    key: input.key,
    version,
  });
  return version;
}

/** Versioned write, history and audit have one transaction boundary (ADR-003 §2). */
export async function changeSetting(input: ChangeSettingInput): Promise<number> {
  const version = await prisma.$transaction((tx) => changeSettingInTransaction(tx, input), {
    isolationLevel: 'ReadCommitted',
    timeout: 30_000,
  });
  invalidateRateLimitPolicy();
  return version;
}

/** Revert copies a historical value into a new version; history remains append-only. */
export async function revertSetting(
  input: Omit<ChangeSettingInput, 'value' | 'source'> & { toVersion: number },
): Promise<number> {
  const { scope, scopeId, eventId } = scopeOf(input.target);
  const history = await prisma.settingChange.findFirst({
    where: { scope, scopeId, eventId, key: input.key, version: input.toVersion },
    select: { after: true, source: true },
  });
  if (!history) throw new NotFoundError('Setting version');
  if (history.source === 'RESET') return resetSetting(input);
  return changeSetting({ ...input, value: history.after, source: 'REVERT' });
}

function resetAuditAfter(
  selection: { scope: string; scopeId: string; version: number },
  revertedFrom: ChangeSettingInput['revertedFrom'],
) {
  return {
    ...selection,
    reset: true,
    ...(revertedFrom ? { source: 'RESET', revertedFrom } : {}),
  };
}

/** Remove an override while preserving its next history version and audit row. */
export async function resetSettingInTransaction(
  tx: PrismaTransactionClient,
  input: Omit<ChangeSettingInput, 'value' | 'source'>,
): Promise<number> {
  if (!SETTINGS[input.key].scopes.includes(input.target.scope)) {
    throw new ValidationError(`${input.key} cannot be reset at ${input.target.scope} scope`);
  }
  await assertSettingTarget(tx, input.target);
  await assertUnlocked(tx, input.target, input.key);
  const current = await storedSetting(input.target, input.key, tx);
  if (!current || current.version !== input.expectedVersion) throw versionConflict();
  const version = await nextVersion(tx, {
    target: input.target,
    key: input.key,
    currentVersion: current.version,
  });
  const { scope, scopeId, eventId } = scopeOf(input.target);
  const deleted = await tx.setting.deleteMany({
    where: { scope, scopeId, eventId, key: input.key, version: input.expectedVersion },
  });
  if (deleted.count !== 1) throw versionConflict();
  await tx.settingChange.create({
    data: {
      scope,
      scopeId,
      eventId,
      key: input.key,
      version,
      before: (current.value === null ? jsonNull : current.value) as JsonValue,
      after: dbNull,
      reason: input.reason ?? null,
      source: 'RESET',
      actorPersonId: input.actorPersonId,
    },
  });
  await writeAudit(tx, {
    ...input.audit,
    eventId,
    action: 'setting.change',
    entityType: 'Setting',
    entityId: input.key,
    after: resetAuditAfter({ scope, scopeId, version }, input.revertedFrom),
  });
  await publishCacheEvent(tx, 'settings', { scope, scopeId, key: input.key, version });
  return version;
}

/** The standalone store and HTTP producers share the exact reset transaction. */
export async function resetSetting(
  input: Omit<ChangeSettingInput, 'value' | 'source'>,
): Promise<number> {
  const version = await prisma.$transaction((tx) => resetSettingInTransaction(tx, input));
  invalidateRateLimitPolicy();
  return version;
}
