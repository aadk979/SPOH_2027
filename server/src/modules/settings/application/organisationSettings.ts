import {
  OrganisationSettingKey,
  OrganisationSettings,
  type ChangeOrganisationSettingRequest,
  type OrganisationSettingsResponse,
} from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { logger } from '../../../platform/logger/index.js';
import { changeSettingInTransaction } from '../../../platform/settings/change.js';
import { SETTINGS } from '../../../platform/settings/registry.js';

const KEYS = OrganisationSettingKey.options;

/** Current organisation authority, under a share lock: never a token claim (D-17). */
async function isPlatformAdmin(
  tx: PrismaTransactionClient,
  input: { organisationId: string; personId: string },
): Promise<boolean> {
  const { organisationId, personId } = input;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership"
    WHERE "organisationId" = ${organisationId} AND "personId" = ${personId} FOR SHARE`;
  const member = await tx.organisationMembership.findUnique({
    where: { organisationId_personId: { organisationId, personId } },
    select: { role: true },
  });
  return member?.role === 'PLATFORM_ADMIN';
}

/**
 * The organisation of the caller's event, after the event and membership locks.
 * Event Chiefs and Admins may read; a platform admin may read whatever their
 * event role, and alone may change.
 */
async function authority(tx: PrismaTransactionClient, actor: ActorContext) {
  const { organisationId } = await holdCaptureEvent(tx, actor.scope);
  const canChange = await isPlatformAdmin(tx, { organisationId, personId: actor.volunteerId });
  await requireCurrentCapability(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: canChange ? 'own.read' : 'config.manage',
  });
  return { organisationId, canChange };
}

/** Each key's stored value, or its default when absent or invalid (ADR-003 §2). */
async function view(
  tx: PrismaTransactionClient,
  input: { organisationId: string; canChange: boolean },
): Promise<OrganisationSettingsResponse> {
  const rows = await tx.setting.findMany({
    where: { scope: 'PLATFORM', scopeId: input.organisationId, eventId: null, key: { in: KEYS } },
    select: { key: true, value: true, version: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const value = <Key extends (typeof KEYS)[number]>(key: Key) => {
    const row = byKey.get(key);
    const parsed = OrganisationSettings.shape[key].safeParse(row?.value);
    if (row && !parsed.success)
      logger.error({ key }, 'stored organisation setting is invalid; using the default');
    return parsed.success ? parsed.data : (SETTINGS[key].default as OrganisationSettings[Key]);
  };
  const version = (key: (typeof KEYS)[number]) => byKey.get(key)?.version ?? 0;
  return {
    organisationId: input.organisationId,
    settings: {
      dashboardPollSeconds: value('dashboardPollSeconds'),
      alertPollSeconds: value('alertPollSeconds'),
      refreshSessionDays: value('refreshSessionDays'),
      idempotencyRetentionDays: value('idempotencyRetentionDays'),
    },
    versions: {
      dashboardPollSeconds: version('dashboardPollSeconds'),
      alertPollSeconds: version('alertPollSeconds'),
      refreshSessionDays: version('refreshSessionDays'),
      idempotencyRetentionDays: version('idempotencyRetentionDays'),
    },
    canChange: input.canChange,
  };
}

export function readOrganisationSettings(
  actor: ActorContext,
): Promise<OrganisationSettingsResponse> {
  return prisma.$transaction(async (tx) => view(tx, await authority(tx, actor)), {
    isolationLevel: 'ReadCommitted',
    timeout: 30_000,
  });
}

/** One key, at the version read, with history and audit; platform admins only (D-17). */
export function changeOrganisationSetting(
  change: ChangeOrganisationSettingRequest,
  actor: ActorContext,
): Promise<OrganisationSettingsResponse> {
  return prisma.$transaction(
    async (tx) => {
      const scope = await authority(tx, actor);
      if (!scope.canChange)
        throw new ForbiddenError(
          'Only a platform admin of this organisation can change its settings.',
        );
      await changeSettingInTransaction(tx, {
        target: { scope: 'platform', organisationId: scope.organisationId },
        key: change.key,
        value: change.value,
        expectedVersion: change.expectedVersion,
        actorPersonId: actor.volunteerId,
        audit: actor.audit,
        ...(change.reason ? { reason: change.reason } : {}),
      });
      return view(tx, scope);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
