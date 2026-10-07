import type { CedarValueJson, EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm/nodejs';
import type { PrismaTransactionClient } from '../../db/client.js';
import { NotFoundError } from '../../errors/index.js';
import { SETTINGS } from '../../settings/registry.js';
import { ref, uid } from './types.js';

/** The schema's resource types (ADR-005 §1); `Setting` is named by its registry key. */
export type ResourceType =
  | 'Organisation'
  | 'Event'
  | 'EventDay'
  | 'Station'
  | 'Membership'
  | 'Registration'
  | 'FootfallTick'
  | 'GiftRedemption'
  | 'MissionCard'
  | 'GiftType'
  | 'Incident'
  | 'LostPersonAlert'
  | 'LostFoundItem'
  | 'Announcement'
  | 'ShiftAssignment'
  | 'SwapRequest'
  | 'BriefingSlot'
  | 'FallbackWindow'
  | 'Setting'
  | 'ScheduledAction'
  | 'VisitorRecord';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly id: string;
}

/** What a loader needs from the builder: shared entities, read once per request. */
export interface ResourceContext {
  put(entity: EntityJson): void;
  /** The event's entity, with its organisation's. */
  event(): Promise<TypeAndId>;
  /** The organisation's entity, once `event()` has been read. */
  organisation(): TypeAndId | null;
  membership(membershipId: string): Promise<TypeAndId>;
  /** The event being asked about. */
  readonly eventId: string;
  readonly now: Date;
}

interface Row {
  readonly eventId: string;
  readonly stationId?: string | null;
  readonly attrs?: Record<string, CedarValueJson>;
}

/** Every lookup names the event (ADR-001 §2): a row of another event is not found. */
interface Where {
  readonly id: string;
  readonly eventId: string;
}

type Loader = (tx: PrismaTransactionClient, where: Where, now: Date) => Promise<Row | null>;

/** An optional reference: Cedar has no null, so a missing one is left out. */
function optional(name: string, type: string, id: string | null): Record<string, CedarValueJson> {
  return id === null ? {} : { [name]: ref(type, id) };
}

/**
 * A required reference whose provenance column is still nullable (backfilled in P09.4).
 * Left out when missing, so the schema check fails the request and it is denied.
 */
const recordedBy = optional;

const eventOnly =
  (
    find: (tx: PrismaTransactionClient, where: Where) => Promise<{ eventId: string } | null>,
  ): Loader =>
  (tx, where) =>
    find(tx, where);

const select = { eventId: true } as const;

const captured =
  (
    find: (
      tx: PrismaTransactionClient,
      where: Where,
    ) => Promise<{
      eventId: string;
      stationId: string;
      recordedByMembershipId: string | null;
    } | null>,
  ): Loader =>
  async (tx, where) => {
    const row = await find(tx, where);
    return (
      row && { ...row, attrs: recordedBy('recordedBy', 'Membership', row.recordedByMembershipId) }
    );
  };

const capturedSelect = { eventId: true, stationId: true, recordedByMembershipId: true } as const;

const LOADERS: Record<
  Exclude<ResourceType, 'Organisation' | 'Event' | 'Membership' | 'Setting'>,
  Loader
> = {
  EventDay: eventOnly((tx, where) => tx.eventDay.findFirst({ where, select })),
  Station: eventOnly((tx, where) => tx.station.findFirst({ where, select })),
  MissionCard: eventOnly((tx, where) => tx.missionCard.findFirst({ where, select })),
  GiftType: eventOnly((tx, where) => tx.giftType.findFirst({ where, select })),
  LostPersonAlert: eventOnly((tx, where) => tx.lostPersonAlert.findFirst({ where, select })),
  LostFoundItem: eventOnly((tx, where) => tx.lostFoundItem.findFirst({ where, select })),
  FallbackWindow: eventOnly((tx, where) => tx.fallbackWindow.findFirst({ where, select })),
  VisitorRecord: eventOnly((tx, where) => tx.visitorRecord.findFirst({ where, select })),
  ScheduledAction: async (tx, where) => {
    const row = await tx.scheduledAction.findFirst({ where, select });
    return row?.eventId ? { eventId: row.eventId } : null;
  },
  Registration: captured((tx, where) =>
    tx.registration.findFirst({ where, select: capturedSelect }),
  ),
  FootfallTick: captured((tx, where) =>
    tx.footfallTick.findFirst({ where, select: capturedSelect }),
  ),
  GiftRedemption: captured((tx, where) =>
    tx.giftRedemption.findFirst({ where, select: capturedSelect }),
  ),
  Incident: async (tx, where) => {
    const row = await tx.incident.findFirst({
      where,
      select: { eventId: true, reportedByMembershipId: true },
    });
    return (
      row && {
        eventId: row.eventId,
        attrs: recordedBy('reportedBy', 'Membership', row.reportedByMembershipId),
      }
    );
  },
  Announcement: async (tx, where) => {
    const row = await tx.announcement.findFirst({
      where,
      select: { eventId: true, targetRole: true, targetStationId: true, targetEventDayId: true },
    });
    return (
      row && {
        eventId: row.eventId,
        attrs: {
          ...(row.targetRole === null ? {} : { targetRole: row.targetRole }),
          ...optional('targetStation', 'Station', row.targetStationId),
          ...optional('targetDay', 'EventDay', row.targetEventDayId),
        },
      }
    );
  },
  ShiftAssignment: async (tx, where, now) => {
    const row = await tx.shiftAssignment.findFirst({
      where,
      select: {
        eventId: true,
        stationId: true,
        membershipId: true,
        shift: { select: { startsAt: true, endsAt: true } },
      },
    });
    if (!row) return null;
    const at = now.getTime();
    return {
      eventId: row.eventId,
      stationId: row.stationId,
      attrs: {
        ...recordedBy('membership', 'Membership', row.membershipId),
        shiftRunning: row.shift.startsAt.getTime() <= at && at < row.shift.endsAt.getTime(),
      },
    };
  },
  SwapRequest: async (tx, where) => {
    const row = await tx.shiftSwapRequest.findFirst({
      where,
      select: {
        eventId: true,
        requesterMembershipId: true,
        assignment: { select: { stationId: true } },
      },
    });
    return (
      row && {
        eventId: row.eventId,
        attrs: {
          ...recordedBy('requester', 'Membership', row.requesterMembershipId),
          station: ref('Station', row.assignment.stationId),
        },
      }
    );
  },
  BriefingSlot: async (tx, where) => {
    const row = await tx.briefingSlot.findFirst({
      where,
      select: { eventId: true, briefierMembershipId: true },
    });
    return (
      row && {
        eventId: row.eventId,
        attrs: optional('briefer', 'Membership', row.briefierMembershipId),
      }
    );
  },
};

/** Load one resource of the event being asked about, with its parents. */
export async function resourceEntity(
  tx: PrismaTransactionClient,
  resource: ResourceRef,
  context: ResourceContext,
): Promise<TypeAndId> {
  switch (resource.type) {
    case 'Organisation': {
      const event = await context.event();
      const organisation = event && context.organisation();
      if (!organisation || organisation.id !== resource.id) throw new NotFoundError('Organisation');
      return organisation;
    }
    case 'Event': {
      if (resource.id !== context.eventId) throw new NotFoundError('Event');
      return context.event();
    }
    case 'Membership':
      return context.membership(resource.id);
    case 'Setting':
      return setting(resource.id, context);
    default:
      return stored(tx, resource, context);
  }
}

/** A setting of the event being asked about, named by its key, with its class (ADR-003). */
async function setting(settingKey: string, context: ResourceContext): Promise<TypeAndId> {
  const definition = (SETTINGS as Record<string, { class: string } | undefined>)[settingKey];
  if (!definition) throw new NotFoundError('Setting');
  const event = await context.event();
  const entity = uid('Setting', settingKey);
  context.put({ uid: entity, attrs: { class: definition.class }, parents: [event] });
  return entity;
}

async function stored(
  tx: PrismaTransactionClient,
  resource: ResourceRef,
  context: ResourceContext,
): Promise<TypeAndId> {
  const load = LOADERS[resource.type as keyof typeof LOADERS];
  const row = await load(tx, { id: resource.id, eventId: context.eventId }, context.now);
  if (!row) throw new NotFoundError(resource.type);
  const event = await context.event();
  const parents = [event];
  if (row.stationId) {
    const station = uid('Station', row.stationId);
    context.put({ uid: station, attrs: {}, parents: [event] });
    parents.unshift(station);
  }
  const entity = uid(resource.type, resource.id);
  context.put({ uid: entity, attrs: row.attrs ?? {}, parents });
  return entity;
}
