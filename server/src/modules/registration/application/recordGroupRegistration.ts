import { randomUUID } from 'node:crypto';
import type { CreateGroupRegistrationRequest, CreateGroupRegistrationResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { startOfEventDay, systemClock } from '../../../platform/time/index.js';
import { linkGroupToCard } from '../../missionCard/index.js';
import { requireActiveStation } from '../../station/index.js';
import { toRegistrationRecord } from '../data/mappers.js';
import { countForStationSince, createRegistrationsForGroup } from '../data/repo.js';
import { expandGroupMembers } from '../domain/groupMembers.js';

/**
 * Group registration (PRODUCT_BRIEF §2.2): a family of four is four
 * registration rows and one Mission Card, linked best-effort.
 */
export async function recordGroupRegistration(
  request: CreateGroupRegistrationRequest,
  { actor, audit, clock = systemClock }: CaptureContext,
): Promise<CreateGroupRegistrationResponse> {
  const station = await requireActiveStation(request.stationId);
  const recordedAt = clock.now();
  const groupId = randomUUID();

  const { registrations, cardId, linkError } = await prisma.$transaction(async (tx) => {
    const link = request.missionCardShortCode
      ? await linkGroupToCard(tx, { shortCode: request.missionCardShortCode, issuedAt: recordedAt })
      : { cardId: null, linkError: null };

    const rows = expandGroupMembers(request, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      groupId,
      missionCardId: link.cardId,
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
    });
    const created = await createRegistrationsForGroup(tx, rows);

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);
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
      },
    });
    return { registrations: created, ...link };
  });

  return {
    groupId,
    registrations: registrations.map(toRegistrationRecord),
    linkedCardId: cardId,
    cardLinkError: linkError,
    boothTotal: await countForStationSince(station.id, startOfEventDay(clock.now())),
  };
}
