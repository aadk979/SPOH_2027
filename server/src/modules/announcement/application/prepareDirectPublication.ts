import type { CreateAnnouncementRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { eventDayAnchorOf, systemClock } from '../../../platform/time/index.js';
import { directPublicationMembership } from '../data/directPublicationRepo.js';
import { draftAuthorStations, lockDraftEvent, validDraftTargets } from '../data/draftRepo.js';
import { assertMaySend } from '../domain/sendRules.js';
import type { DirectSender } from './directSender.js';

async function assertTargets(tx: PrismaTransactionClient, input: { request: CreateAnnouncementRequest; sender: DirectSender; now: Date }) {
  const targets = await validDraftTargets(input.sender.scope, { tx, target: input.request.target });
  if (!targets.station) throw new NotFoundError('Station');
  if (!targets.day) throw new NotFoundError('Event day');
  if (input.request.expiresAt && Date.parse(input.request.expiresAt) <= input.now.getTime())
    throw new ValidationError('Choose an announcement expiry in the future.');
}

export async function prepareDirectPublication(tx: PrismaTransactionClient, input: {
  request: CreateAnnouncementRequest; sender: DirectSender;
}) {
  const { sender, request } = input;
  const event = await lockDraftEvent(sender.scope, tx);
  if (event.status === 'ARCHIVED') throw new ValidationError('Archived announcements are read only.');
  const member = await directPublicationMembership(sender.scope, { tx, personId: sender.volunteerId });
  if (!member || (sender.membershipId && sender.membershipId !== member.id)) throw new NotFoundError('Membership');
  const stationId = request.target.stationId ?? null;
  await requireCurrentPermission(tx, { scope: sender.scope, personId: sender.volunteerId,
    membershipId: member.id, action: stationId ? 'Announcement.SendStation' : 'Announcement.SendEvent',
    resource: stationId ? { type: 'Station', id: stationId } : { type: 'Event', id: sender.scope.eventId } });
  const now = (sender.clock ?? systemClock).now();
  await assertTargets(tx, { request, sender, now });
  const postings = await draftAuthorStations(sender.scope, { tx, personId: sender.volunteerId,
    today: eventDayAnchorOf(now, event) });
  assertMaySend({ role: member.role, todaysStationIds: postings.map((row) => row.stationId) }, stationId);
  return { now, event };
}
