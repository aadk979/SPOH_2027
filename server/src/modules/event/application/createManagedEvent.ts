import { createHash } from 'node:crypto';
import {
  ERROR_CODES,
  type CreateEventRequest,
  type CloneEventWizardRequest,
  type EventCreatedResponse,
} from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { defaultRoleGrantRows } from '../../../platform/access/authorizer/roleGrants.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import {
  ConflictError,
  IdempotencyKeyReuseError,
  NotFoundError,
} from '../../../platform/errors/index.js';
import { invalidateEventCache } from '../../../platform/event/events.js';
import { systemClock } from '../../../platform/time/index.js';
import { insertEvent, insertRoleGrants, type Event } from '../data/repo.js';
import {
  createEventDays,
  findManagedEvent,
  joinCreatedEvent,
  lockManagedReceipt,
  lockManagedSlug,
  lockManagedSource,
  readOrganisationLocale,
  saveManagedReceipt,
} from '../data/managedEventRepo.js';
import { requireOrganisationAuthority } from './organisationAuthority.js';
import { applyCloneInTransaction } from './applyClone.js';
import { managedClonePlan } from './managedClonePlan.js';

export interface PlatformEventActor {
  personId: string;
  sub: string;
  audit: AuditContext;
}
type ManagedInput = CreateEventRequest | CloneEventWizardRequest;
type StoredReceipt = { eventId?: string; joined?: boolean; fingerprint?: string };
type Mutation = {
  input: ManagedInput;
  actor: PlatformEventActor;
  mode: 'create' | 'clone';
  build: (tx: PrismaTransactionClient) => Promise<Event>;
};

function response(event: Event, joined: boolean): EventCreatedResponse {
  return {
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      timezone: event.timezone,
      locale: event.locale,
      status: event.status,
    },
    joined,
  };
}

/** The current authority, event, audit and settled receipt commit together. */
async function managedMutation({
  input,
  actor,
  mode,
  build,
}: Mutation): Promise<EventCreatedResponse> {
  const endpoint = `platform.event.${mode}`;
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const result = await prisma.$transaction(
    async (tx) => {
      const receipt = await lockManagedReceipt(tx, input.idempotencyKey);
      await requireOrganisationAuthority(tx, {
        personId: actor.personId,
        organisationId: input.organisationId,
        action: mode === 'create' ? 'Platform.CreateEvent' : 'Platform.CloneEvent',
      });
      if (receipt) {
        const stored = receipt.responseBody as StoredReceipt;
        if (
          receipt.actorSub !== actor.sub ||
          receipt.endpoint !== endpoint ||
          receipt.eventId !== null ||
          stored.fingerprint !== fingerprint
        )
          throw new IdempotencyKeyReuseError();
        const event = stored.eventId
          ? await findManagedEvent(tx, { id: stored.eventId, organisationId: input.organisationId })
          : null;
        if (!event) throw new NotFoundError('Event');
        return response(event, stored.joined === true);
      }
      const event = await build(tx);
      if (input.joinAsAdmin) await joinEvent(tx, event, actor);
      await saveManagedReceipt(tx, {
        key: input.idempotencyKey,
        endpoint,
        actorSub: actor.sub,
        eventId: event.id,
        joined: input.joinAsAdmin,
        fingerprint,
      });
      return response(event, input.joinAsAdmin);
    },
    { timeout: 30_000 },
  );
  invalidateEventCache();
  return result;
}

async function joinEvent(
  tx: PrismaTransactionClient,
  event: Event,
  actor: PlatformEventActor,
): Promise<void> {
  const membership = await joinCreatedEvent(tx, {
    eventId: event.id,
    personId: actor.personId,
    now: systemClock.now(),
  });
  await writeAudit(tx, {
    ...actor.audit,
    eventId: event.id,
    membershipId: membership.id,
    action: 'user.provision',
    entityType: 'EventMembership',
    entityId: membership.id,
    after: {
      personId: actor.personId,
      role: 'ADMIN',
      status: 'ACTIVE',
      reason: 'Explicitly joined through event creation wizard',
    },
  });
}

export function createManagedEvent(
  input: CreateEventRequest,
  actor: PlatformEventActor,
): Promise<EventCreatedResponse> {
  return managedMutation({
    input,
    actor,
    mode: 'create',
    build: async (tx) => {
      await assertSlugAvailable(tx, input);
      const org = await readOrganisationLocale(tx, input.organisationId);
      const event = await insertEvent(tx, {
        organisationId: input.organisationId,
        name: input.name,
        slug: input.slug,
        venue: input.venue || null,
        timezone: input.timezone,
        locale: org.locale,
        status: 'DRAFT',
      });
      await insertRoleGrants(tx, { eventId: event.id }, defaultRoleGrantRows());
      await createEventDays(tx, {
        eventId: event.id,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      await writeAudit(tx, {
        ...actor.audit,
        eventId: event.id,
        membershipId: null,
        action: 'event.create',
        entityType: 'Event',
        entityId: event.id,
        after: {
          name: event.name,
          slug: event.slug,
          venue: event.venue,
          timezone: event.timezone,
          startDate: input.startDate,
          endDate: input.endDate,
        },
      });
      return event;
    },
  });
}

export function cloneManagedEvent(
  input: CloneEventWizardRequest,
  actor: PlatformEventActor,
): Promise<EventCreatedResponse> {
  return managedMutation({
    input,
    actor,
    mode: 'clone',
    build: async (tx) => {
      const source = await lockManagedSource(tx, {
        id: input.sourceEventId,
        organisationId: input.organisationId,
      });
      if (!source) throw new NotFoundError('Event');
      await assertSlugAvailable(tx, {
        organisationId: input.organisationId,
        slug: input.clone.slug,
      });
      const plan = await managedClonePlan(tx, { source, request: input.clone });
      return applyCloneInTransaction(tx, plan, { audit: actor.audit, now: systemClock.now() });
    },
  });
}

async function assertSlugAvailable(
  tx: PrismaTransactionClient,
  input: { organisationId: string; slug: string },
): Promise<void> {
  if (await lockManagedSlug(tx, input))
    throw new ConflictError(ERROR_CODES.CONFLICT, 'This event address is already in use.');
}
