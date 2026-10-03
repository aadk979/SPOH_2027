import { ERROR_CODES, type CreateAnnouncementRequest } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventDayAnchorOf, systemClock, type Clock } from '../../../platform/time/index.js';
import {
  currentDraftAuthor,
  draftAuthorStations,
  lockDraftEvent,
  validDraftTargets,
} from '../data/draftRepo.js';
import { assertMaySend } from '../domain/sendRules.js';

export type DraftActor = ActorContext & { clock?: Clock };

/** Recheck current authority and targets after waiting for the exclusive Event lock. */
export async function prepareDraftMutation(
  tx: PrismaTransactionClient,
  input: { request: CreateAnnouncementRequest; actor: DraftActor },
) {
  const { actor, request } = input;
  const { scope } = actor;
  const event = await lockDraftEvent(scope, tx);
  if (event.status === 'ARCHIVED') {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived announcement drafts are read-only.');
  }
  await requireCurrentCapability(tx, {
    scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    capability: 'announcement.station.send',
  });
  const author = await currentDraftAuthor(scope, {
    tx,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
  });
  const targets = await validDraftTargets(scope, { tx, target: request.target });
  if (!targets.station) throw new NotFoundError('Station');
  if (!targets.day) throw new NotFoundError('Event day');
  const now = (actor.clock ?? systemClock).now();
  if (request.expiresAt && Date.parse(request.expiresAt) <= now.getTime()) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The draft expiry must be in the future.');
  }
  const postings = await draftAuthorStations(scope, {
    tx,
    personId: actor.volunteerId,
    today: eventDayAnchorOf(now, event),
  });
  assertMaySend(
    { role: author.role, todaysStationIds: postings.map((row) => row.stationId) },
    request.target.stationId ?? null,
  );
  return { now, scope };
}
