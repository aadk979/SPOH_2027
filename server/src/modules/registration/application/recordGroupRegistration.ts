import { captureStation } from '../../../platform/access/captureStation.js';
import { randomUUID } from 'node:crypto';
import type { CreateGroupRegistrationRequest, CreateGroupRegistrationResponse } from '@spoh/shared';
import {
  auditStationScopeBypass,
  captureAuditFields,
  writeAudit,
} from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import { systemClock } from '../../../platform/time/index.js';
import { linkGroupToCard } from '../../missionCard/index.js';
import { requireActiveStation } from '../../station/index.js';
import { toRegistrationRecord } from '../data/mappers.js';
import { countForStationSince, createRegistrationsForGroup } from '../data/repo.js';
import { expandGroupMembers } from '../domain/groupMembers.js';
import { requireCategories } from './requireCategory.js';

/**
 * Group registration (PRODUCT_BRIEF §2.2): a family of four is four
 * registration rows and one Mission Card, linked best-effort.
 */
export async function recordGroupRegistration(
  request: CreateGroupRegistrationRequest,
  { actor, scope, audit, clock = systemClock }: CaptureContext,
): Promise<CreateGroupRegistrationResponse> {
  const station = await requireActiveStation(scope, request.stationId);
  const recordedAt = clock.now();
  const groupId = randomUUID();

  const { registrations, cardId, linkError, rehearsal } = await prisma.$transaction(async (tx) => {
    const mode = await captureStation(tx, { scope, actor, clock }, request);
    const link = await linkGroupToCard(tx, scope, {
      shortCode: request.missionCardShortCode,
      issuedAt: recordedAt,
    });

    const codes = request.members.map((member) => member.category);
    const rows = expandGroupMembers(request, await requireCategories(tx, scope, codes), {
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedByMembershipId: actor.membershipId,
      groupId,
      missionCardId: link.cardId,
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
    });
    const created = await createRegistrationsForGroup(tx, scope, rows);

    await auditStationScopeBypass(tx, mode.stationScopeBypass, audit);
    await writeAudit(tx, {
      ...audit,
      action: 'registration.createGroup',
      entityType: 'Registration',
      entityId: groupId,
      after: {
        groupId,
        stationId: station.id,
        memberCount: created.length,
        linkedCardId: link.cardId,
        cardLinkError: link.linkError,
        ...captureAuditFields(mode),
      },
    });
    return { registrations: created, ...link, rehearsal: mode.rehearsal };
  });

  const since = await eventTodayStart(scope, clock.now());
  return {
    groupId,
    registrations: registrations.map(toRegistrationRecord),
    linkedCardId: cardId,
    cardLinkError: linkError,
    boothTotal: await countForStationSince({ ...scope, rehearsal }, station.id, since),
  };
}
