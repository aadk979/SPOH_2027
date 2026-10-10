import { ROLE_IDS, ROLE_RANKS, type Action, type Role } from '@spoh/access-policies';
import type { Request } from 'express';
import type { ResourceRef, ResourceType } from '../access/authorizer/index.js';
import { settingQuestion } from '../access/settingQuestion.js';
import { stationCandidates } from '../access/stationCandidates.js';
import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { eventDayAnchorOf, systemClock } from '../time/index.js';
import type { Check, ChecksOf, ResourceOf } from './authorize.js';
import { getAuth } from './requireAuth.js';

/**
 * How a route names the resource it acts on (ADR-005 §1). These run before the route's
 * validation, so they read the raw request and fail as a bad request or not found, never as
 * a decision: in shadow that is logged, and the route's own validation answers the caller.
 */

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new ValidationError(`${name} is required`);
  return value;
}

function bodyField(req: Request, path: readonly string[]): unknown {
  let value: unknown = req.body;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** The event the request works in. */
export const theEvent: ResourceOf = (req) => ({ type: 'Event', id: getAuth(req).eventId });

/** The caller's own membership: what every member may read about themselves. */
export const self: ResourceOf = (req) => ({ type: 'Membership', id: getAuth(req).membershipId });

/** The organisation that owns the event. */
export const theOrganisation: ResourceOf = async (req) => {
  const event = await prisma.event.findUnique({
    where: { id: getAuth(req).eventId },
    select: { organisationId: true },
  });
  if (!event) throw new NotFoundError('Event');
  return { type: 'Organisation', id: event.organisationId };
};

/** A resource named by a path parameter. */
export const fromParam =
  (type: ResourceType, name = 'id'): ResourceOf =>
  (req) => ({ type, id: text(req.params[name], name) });

/** A resource named by a body field (a dotted path for a nested one). */
export const fromBody =
  (type: ResourceType, field: string): ResourceOf =>
  (req) => ({ type, id: text(bodyField(req, field.split('.')), field) });

/** Capture names its station in the body. */
export const stationFromBody: ResourceOf = fromBody('Station', 'stationId');

/** The membership in this event of the person a path names (`/volunteers/:id`). */
export const memberFromPersonParam =
  (name = 'id'): ResourceOf =>
  async (req) => {
    const member = await prisma.eventMembership.findFirst({
      where: { eventId: getAuth(req).eventId, personId: text(req.params[name], name) },
      select: { id: true },
    });
    if (!member) throw new NotFoundError('Membership');
    return { type: 'Membership', id: member.id };
  };

/** A mission card named by its short code. */
export const cardFromShortCode: ResourceOf = async (req) => {
  const card = await prisma.missionCard.findFirst({
    where: { eventId: getAuth(req).eventId, shortCode: text(req.params.shortCode, 'shortCode') },
    select: { id: true },
  });
  if (!card) throw new NotFoundError('MissionCard');
  return { type: 'MissionCard', id: card.id };
};

/** The action that changes a setting follows its class (ADR-003, `CHANGES.md` C9). */
export function settingCheck(key: string): Check {
  return settingQuestion(key);
}

/** A change to the setting the body names by `key`. */
export const settingFromBody: ChecksOf = (req) => [
  settingCheck(text(bodyField(req, ['key']), 'key')),
];

/**
 * A change through the settings catalogue, which takes operational settings only. A key of
 * another class is malformed there, and the route's validation answers it (400): asking its
 * class's action first would refuse it as a permission instead.
 */
export const operationalSettingFromBody: ChecksOf = (req) => {
  const key = text(bodyField(req, ['key']), 'key');
  const check = settingCheck(key);
  return [
    check.action === 'Settings.ManageEvent' ? check : { ...check, action: 'Settings.ManageEvent' },
  ];
};

/** An announcement to one station is a station send; with none, it goes to the whole event. */
export const announcementTarget: ChecksOf = (req) => {
  const stationId = bodyField(req, ['target', 'stationId']);
  return typeof stationId === 'string' && stationId.length > 0
    ? [{ action: 'Announcement.SendStation', resource: { type: 'Station', id: stationId } }]
    : [{ action: 'Announcement.SendEvent', resource: { type: 'Event', id: getAuth(req).eventId } }];
};

const TRANSITIONS: Record<string, Action> = {
  READY: 'Event.MarkReady',
  DRAFT: 'Event.MarkReady',
  REHEARSAL: 'Event.Rehearse',
  LIVE: 'Event.GoLive',
  CLOSED: 'Event.Close',
  ARCHIVED: 'Event.Archive',
};

/** A lifecycle transition is the action for its target; LIVE from CLOSED reopens (C13). */
export const lifecycleTransition: ChecksOf = async (req) => {
  const to = text(bodyField(req, ['to']), 'to');
  const { eventId } = getAuth(req);
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event) throw new NotFoundError('Event');
  const action = to === 'LIVE' && event.status === 'CLOSED' ? 'Event.Reopen' : TRANSITIONS[to];
  if (!action) throw new ValidationError(`Unknown lifecycle target ${to}`);
  return [{ action, resource: { type: 'Event', id: eventId } }];
};

/** The rank of the role a body grants, which no member may grant at or above their own. */
export function grantedRank(req: Request, fallback?: string): number | undefined {
  const role = bodyField(req, ['role']) ?? fallback;
  return ROLE_IDS.includes(role as Role) ? ROLE_RANKS[role as Role] : undefined;
}

/** Editing a member: the fields are `People.Update`; a role change is also `People.AssignRole`. */
export function memberEdit(resource: ResourceOf): ChecksOf {
  return async (req) => {
    const target: ResourceRef = await resource(req);
    const rank = grantedRank(req);
    return [
      { action: 'People.Update', resource: target },
      ...(rank === undefined
        ? []
        : [
            {
              action: 'People.AssignRole' as const,
              resource: target,
              facts: { grantedRank: rank },
            },
          ]),
    ];
  };
}

/**
 * Candidates for a collection read of station-level data: the caller's assigned stations,
 * or, with none, one station of the event. Asked with `any`, this is "may this member read
 * station-level data at all"; the use case filters what it returns.
 */
export function anyStation(action: Action): ChecksOf {
  return async (req) => {
    const { eventId, membershipId } = getAuth(req);
    const stations = await stationCandidates(prisma, { eventId }, membershipId);
    return stations.map((resource) => ({ action, resource }));
  };
}

/** The queue of swap requests awaiting a decision, asked of one pending request. */
export const anyPendingSwap: ChecksOf = async (req) => {
  const pending = await prisma.shiftSwapRequest.findFirst({
    where: { eventId: getAuth(req).eventId, status: 'REQUESTED' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return pending
    ? [{ action: 'Swap.Decide', resource: { type: 'SwapRequest', id: pending.id } }]
    : [];
};

/** Attendance is for today's event day; on a day that is not an event day there is none. */
export function today(action: Action): ChecksOf {
  return async (req) => {
    const { eventId } = getAuth(req);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { timezone: true, dayBoundaryMinutes: true },
    });
    if (!event) throw new NotFoundError('Event');
    const day = await prisma.eventDay.findUnique({
      where: { eventId_date: { eventId, date: eventDayAnchorOf(systemClock.now(), event) } },
      select: { id: true },
    });
    return day ? [{ action, resource: { type: 'EventDay', id: day.id } }] : [];
  };
}

/** Organisation-wide settings are the organisation's platform admins' (D-17), as a person. */
export const organisationAdmin: ChecksOf = async (req) => [
  { action: 'Platform.ManageOrganisation', resource: await theOrganisation(req), asPerson: true },
];

/** Inviting someone grants the role the body names, Volunteer by default (C5). */
export const invite: ChecksOf = async (req) => {
  const rank = grantedRank(req, 'VOLUNTEER');
  return [
    {
      action: 'People.Invite',
      resource: await theEvent(req),
      ...(rank === undefined ? {} : { facts: { grantedRank: rank } }),
    },
  ];
};
