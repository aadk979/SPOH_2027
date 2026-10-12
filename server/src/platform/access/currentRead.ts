import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { NotFoundError, ServiceUnavailableError } from '../errors/index.js';
import { EntityBuilder, type Question } from './authorizer/index.js';
import { currentAuthorizer } from './engine.js';

export interface CurrentRead extends Question {
  readonly eventId: string;
  readonly personId: string;
  readonly membershipId?: string;
  readonly now: Date;
  readonly ip?: string | null;
  readonly asPerson?: boolean;
}

/** Bind the authenticated account to the exact scoped principal. */
async function principalIsBound(db: PrismaTransactionClient, input: CurrentRead): Promise<boolean> {
  const person = await db.person.findUnique({
    where: { id: input.personId }, select: { deactivatedAt: true },
  });
  if (!person || person.deactivatedAt !== null) return false;
  if (!input.asPerson) {
    if (!input.membershipId) return false;
    // EntityBuilder derives its principal from a membership. Bind that principal to
    // the authenticated person before asking it; an unrelated member cannot stand in.
    const member = await db.eventMembership.findFirst({
      where: { id: input.membershipId, eventId: input.eventId, personId: input.personId },
      select: { id: true },
    });
    if (!member) return false;
  }
  return true;
}

/** Strict read evaluation. Mutation-only phase exceptions never apply to reads. */
export async function canReadCurrent(db: PrismaTransactionClient, input: CurrentRead): Promise<boolean> {
  try {
    if (!await principalIsBound(db, input)) return false;
    const builder = new EntityBuilder(db, { eventId: input.eventId, now: input.now });
    const question: Question = {
      action: input.action, resource: input.resource,
      facts: { ...(input.ip !== undefined ? { ip: input.ip } : {}), ...input.facts },
    };
    const request = input.asPerson
      ? await builder.forPerson(input.personId, question)
      : await builder.forMembership(input.membershipId!, question);
    const decision = await currentAuthorizer().isAuthorized(request);
    if (decision.errors.length > 0) throw new ServiceUnavailableError('Permissions could not be checked.');
    return decision.allowed;
  } catch (cause) {
    if (cause instanceof NotFoundError) return false;
    if (cause instanceof ServiceUnavailableError) throw cause;
    throw new ServiceUnavailableError('Permissions could not be checked.', cause);
  }
}

export interface ReadContext {
  readonly scope: EventScope;
  readonly personId: string;
  readonly membershipId?: string;
  readonly now: Date;
  readonly db: PrismaTransactionClient;
  canRead(question: Question & { readonly asPerson?: boolean }): Promise<boolean>;
}

/** Request/job-bound port. Each question uses fresh facts, with no cross-request cache. */
export function createReadContext(input: {
  scope: EventScope; personId: string; membershipId?: string; now: Date;
  db: PrismaTransactionClient; ip?: string | null;
}): ReadContext {
  return {
    scope: input.scope, personId: input.personId, now: input.now, db: input.db,
    ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
    canRead: (question) => canReadCurrent(input.db, {
      eventId: input.scope.eventId, personId: input.personId, now: input.now,
      ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
      ...(input.ip !== undefined ? { ip: input.ip } : {}), ...question,
    }),
  };
}
