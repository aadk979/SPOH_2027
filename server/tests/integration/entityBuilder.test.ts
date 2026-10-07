import type { EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm/nodejs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/platform/db/client.js';
import { createEvent } from '../../src/modules/event/index.js';
import {
  decisionKey,
  EntityBuilder,
  LocalCedarAuthorizer,
  type AuthorizationRequest,
} from '../../src/platform/access/authorizer/index.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  categoryId,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  membershipOf,
  setMembership,
  TEST_EVENT_TIMEZONE,
  testEvent,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * The entity builder reads what the policies need from the database (ADR-005 §1),
 * and the local engine decides on it. FROZEN_NOW is inside the MORNING shift.
 */
const local = new LocalCedarAuthorizer();
const HOUR = 3_600_000;

let eventId: string;
let dayId: string;
let stationId: string;
let otherStationId: string;
let volunteer: { personId: string; membershipId: string };
let chief: { personId: string; membershipId: string };

async function member(email: string, role: 'VOLUNTEER' | 'CHIEF_COORDINATOR' | 'ADMIN' | 'LEAD') {
  const person = await createVolunteer({ email, role });
  return { personId: person.id, membershipId: (await membershipOf(person.id)).id };
}

const builder = (now: Date = FROZEN_NOW) => new EntityBuilder(prisma, { eventId, now });

function entity(request: AuthorizationRequest, type: string, id: string): EntityJson {
  const found = request.entities.find(({ uid }) => {
    const { type: found, id: foundId } = uid as TypeAndId;
    return found === `SPOH::${type}` && foundId === id;
  });
  if (!found) throw new Error(`no ${type}::${id}`);
  return found;
}

const station = (id: string) => ({ __entity: { type: 'SPOH::Station', id } });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'S1' })).id;
  otherStationId = (await createStation({ code: 'S2' })).id;
  volunteer = await member('volunteer@authz.test', 'VOLUNTEER');
  chief = await member('chief@authz.test', 'CHIEF_COORDINATOR');
  await assignToStation({ volunteerId: volunteer.personId, stationId, eventDayId: dayId });
  await assignToStation({
    volunteerId: volunteer.personId,
    stationId: otherStationId,
    eventDayId: dayId,
    shift: 'AFTERNOON',
  });
});

describe('a member of the event', () => {
  it('carries the role, its grants and the stations on shift now', async () => {
    const request = await builder().forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: {
        type: 'Station',
        id: stationId,
      },
    });
    expect(request).toMatchObject({
      principal: { type: 'SPOH::Membership', id: volunteer.membershipId },
      action: 'Registration.Create',
      resource: { type: 'SPOH::Station', id: stationId },
      context: { eventPhase: 'LIVE', lateSyncAllowed: false, onTrustedNetwork: false },
      eventId,
    });
    const membership = entity(request, 'Membership', volunteer.membershipId);
    expect(membership.parents).toEqual([{ type: 'SPOH::Event', id: eventId }]);
    expect(membership.attrs).toMatchObject({
      rank: 10,
      active: true,
      onShiftStations: [station(stationId)],
      workingDays: [{ __entity: { type: 'SPOH::EventDay', id: dayId } }],
      attendanceVerifiedToday: false,
      isAttendanceRoot: false,
    });
    expect(membership.attrs.assignedStations).toEqual(
      [stationId, otherStationId].sort().map(station),
    );
    expect(entity(request, 'Role', `${eventId}/VOLUNTEER`).attrs).toMatchObject({
      catalogueRole: 'VOLUNTEER',
      rank: 10,
      anyStation: false,
    });
    expect(entity(request, 'Person', volunteer.personId).attrs).toEqual({
      active: true,
      platformAdmin: false,
    });
    expect(local.evaluate(request)).toMatchObject({ allowed: true, errors: [] });
  });

  it('is refused away from the station it is on shift at, and off shift', async () => {
    const elsewhere = await builder().forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: {
        type: 'Station',
        id: otherStationId,
      },
    });
    expect(local.evaluate(elsewhere)).toMatchObject({ allowed: false, errors: [] });
    const beforeShifts = await builder(new Date(FROZEN_NOW.getTime() - 6 * HOUR)).forMembership(
      volunteer.membershipId,
      { action: 'Registration.Create', resource: { type: 'Station', id: stationId } },
    );
    expect(
      entity(beforeShifts, 'Membership', volunteer.membershipId).attrs.onShiftStations,
    ).toEqual([]);
    expect(local.evaluate(beforeShifts).allowed).toBe(false);
  });

  it('judges a late-synced capture at its recorded time', async () => {
    const afternoon = new Date(FROZEN_NOW.getTime() + 3 * HOUR);
    const request = await new EntityBuilder(prisma, {
      eventId,
      now: FROZEN_NOW,
      shiftAt: afternoon,
    }).forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: {
        type: 'Station',
        id: otherStationId,
      },
      facts: { lateSyncAllowed: true },
    });
    expect(entity(request, 'Membership', volunteer.membershipId).attrs.onShiftStations).toEqual([
      station(otherStationId),
    ]);
    expect(request.context.lateSyncAllowed).toBe(true);
  });

  it('reads today’s attendance, the root and the trusted networks from the event', async () => {
    const admin = await member('admin@authz.test', 'ADMIN');
    await prisma.attendance.create({
      data: {
        eventId,
        volunteerId: chief.personId,
        membershipId: chief.membershipId,
        eventDayId: dayId,
        method: 'PIN',
      },
    });
    await prisma.setting.createMany({
      data: [
        {
          scope: 'EVENT',
          scopeId: eventId,
          eventId,
          key: 'attendance.rootMembershipId',
          value: admin.membershipId,
          version: 1,
        },
        {
          scope: 'EVENT',
          scopeId: eventId,
          eventId,
          key: 'attendance.campusCidrs',
          value: ['203.0.113.0/24'],
          version: 1,
        },
      ],
    });
    const verified = await builder().forMembership(chief.membershipId, {
      action: 'Attendance.IssueCode',
      resource: { type: 'EventDay', id: dayId },
      facts: { ip: '203.0.113.7' },
    });
    expect(entity(verified, 'Membership', chief.membershipId).attrs).toMatchObject({
      attendanceVerifiedToday: true,
      isAttendanceRoot: false,
    });
    expect(verified.context.onTrustedNetwork).toBe(true);
    const root = await builder().forMembership(admin.membershipId, {
      action: 'Attendance.MarkRoot',
      resource: {
        type: 'Membership',
        id: chief.membershipId,
      },
    });
    expect(entity(root, 'Membership', admin.membershipId).attrs.isAttendanceRoot).toBe(true);
  });

  it('reports a deactivated membership as inactive, and the guardrail refuses it', async () => {
    await setMembership(volunteer.personId, { status: 'DEACTIVATED', deactivatedAt: FROZEN_NOW });
    const request = await builder().forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: {
        type: 'Station',
        id: stationId,
      },
    });
    expect(entity(request, 'Membership', volunteer.membershipId).attrs.active).toBe(false);
    expect(local.evaluate(request).allowed).toBe(false);
  });

  it('builds the same request twice, so the decision cache sees one key', async () => {
    const ref = { type: 'Station' as const, id: stationId };
    const first = await builder().forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: ref,
    });
    const second = await builder().forMembership(volunteer.membershipId, {
      action: 'Registration.Create',
      resource: ref,
    });
    expect(decisionKey(second)).toBe(decisionKey(first));
  });

  it('refuses a membership of another event as the principal', async () => {
    const other = await otherEvent();
    await expect(
      new EntityBuilder(prisma, { eventId: other, now: FROZEN_NOW }).forMembership(
        volunteer.membershipId,
        { action: 'Self.Read', resource: { type: 'Membership', id: volunteer.membershipId } },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('resources', () => {
  it('names who recorded a capture, under its station and event', async () => {
    const registration = await prisma.registration.create({
      data: {
        eventId,
        categoryId: await categoryId('SEC_1'),
        stationId,
        recordedById: volunteer.personId,
        recordedByMembershipId: volunteer.membershipId,
        idempotencyKey: idempotencyKey(),
      },
    });
    const request = await builder().forMembership(chief.membershipId, {
      action: 'Record.Void',
      resource: {
        type: 'Registration',
        id: registration.id,
      },
    });
    expect(entity(request, 'Registration', registration.id)).toEqual({
      uid: { type: 'SPOH::Registration', id: registration.id },
      attrs: { recordedBy: { __entity: { type: 'SPOH::Membership', id: volunteer.membershipId } } },
      parents: [
        { type: 'SPOH::Station', id: stationId },
        { type: 'SPOH::Event', id: eventId },
      ],
    });
    expect(local.evaluate(request)).toMatchObject({ allowed: true, errors: [] });
  });

  it('marks an assignment running only during its shift', async () => {
    const assignment = await prisma.shiftAssignment.findFirstOrThrow({
      where: { eventId, membershipId: volunteer.membershipId, stationId },
    });
    const request = await builder().forMembership(volunteer.membershipId, {
      action: 'Shift.CheckIn',
      resource: {
        type: 'ShiftAssignment',
        id: assignment.id,
      },
    });
    expect(entity(request, 'ShiftAssignment', assignment.id).attrs).toEqual({
      membership: { __entity: { type: 'SPOH::Membership', id: volunteer.membershipId } },
      shiftRunning: true,
    });
  });

  it('gives a setting its class, and refuses an unknown key', async () => {
    const request = await builder().forMembership(chief.membershipId, {
      action: 'Settings.ManagePrivacy',
      resource: {
        type: 'Setting',
        id: 'lostPersonPurgeHours',
      },
    });
    expect(entity(request, 'Setting', 'lostPersonPurgeHours').attrs).toEqual({
      class: 'privacy',
    });
    // A locked platform-admin action: an event Chief is refused (ADR-005 §5).
    expect(local.evaluate(request)).toMatchObject({ allowed: false, errors: [] });
    await expect(
      builder().forMembership(chief.membershipId, {
        action: 'Settings.ManageEvent',
        resource: {
          type: 'Setting',
          id: 'no.such.setting',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not find a row of another event (ADR-001 §2)', async () => {
    const other = await otherEvent();
    const outsider = await prisma.person.create({
      data: { email: 'outsider@authz.test', displayName: 'Outsider', cognitoSub: 'local:outsider' },
    });
    const foreign = await prisma.eventMembership.create({
      data: { eventId: other, personId: outsider.id, role: 'VOLUNTEER' },
    });
    await expect(
      builder().forMembership(chief.membershipId, {
        action: 'People.Update',
        resource: {
          type: 'Membership',
          id: foreign.id,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      builder().forPerson(chief.personId, {
        action: 'Platform.AdministerEvent',
        resource: { type: 'Event', id: other },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a resource that does not exist', async () => {
    await expect(
      builder().forMembership(chief.membershipId, {
        action: 'Record.Void',
        resource: {
          type: 'Registration',
          id: 'none',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('every resource type', () => {
  const membershipRef = (id: string) => ({ __entity: { type: 'SPOH::Membership', id } });
  const eventParent = () => ({ type: 'SPOH::Event', id: eventId });
  const stationParents = () => [{ type: 'SPOH::Station', id: stationId }, eventParent()];
  const by = () => ({
    recordedById: volunteer.personId,
    recordedByMembershipId: volunteer.membershipId,
  });

  /** Each row as the policies see it; an action that applies to it is evaluated cleanly. */
  async function rows() {
    const card = await prisma.missionCard.create({
      data: { eventId, shortCode: 'AUTHZ1', qrPayload: 'authz-card' },
    });
    const gift = await prisma.giftType.create({ data: { eventId, name: 'Pin', initialStock: 5 } });
    const registration = await prisma.registration.create({
      data: {
        eventId,
        categoryId: await categoryId('SEC_1'),
        stationId,
        ...by(),
        idempotencyKey: idempotencyKey(),
      },
    });
    const assignment = await prisma.shiftAssignment.findFirstOrThrow({
      where: { eventId, membershipId: volunteer.membershipId, stationId },
    });
    const tick = await prisma.footfallTick.create({
      data: { eventId, stationId, ...by(), idempotencyKey: idempotencyKey() },
    });
    const redemption = await prisma.giftRedemption.create({
      data: { eventId, giftTypeId: gift.id, stationId, ...by(), idempotencyKey: idempotencyKey() },
    });
    const incident = await prisma.incident.create({
      data: {
        eventId,
        type: 'OTHER',
        severity: 'LOW',
        description: 'Spill',
        reportedById: volunteer.personId,
        reportedByMembershipId: volunteer.membershipId,
        occurredAt: FROZEN_NOW,
        idempotencyKey: idempotencyKey(),
      },
    });
    const alert = await prisma.lostPersonAlert.create({
      data: { eventId, raisedById: volunteer.personId },
    });
    const item = await prisma.lostFoundItem.create({
      data: { eventId, itemLabel: 'Bag', foundAt: FROZEN_NOW, loggedById: volunteer.personId },
    });
    const announcement = await prisma.announcement.create({
      data: {
        eventId,
        body: 'Hello',
        authorId: chief.personId,
        targetRole: 'VOLUNTEER',
        targetStationId: stationId,
      },
    });
    const swap = await prisma.shiftSwapRequest.create({
      data: {
        eventId,
        assignmentId: assignment.id,
        requesterId: volunteer.personId,
        requesterMembershipId: volunteer.membershipId,
        targetId: chief.personId,
      },
    });
    const briefing = await prisma.briefingSlot.create({
      data: {
        eventId,
        eventDayId: dayId,
        startsAt: FROZEN_NOW,
        briefierId: chief.personId,
        briefierMembershipId: chief.membershipId,
      },
    });
    const visitor = await prisma.visitorRecord.create({
      data: { eventId, rehearsal: false, registrationId: registration.id, data: {} },
    });
    const fallback = await prisma.fallbackWindow.create({
      data: {
        eventId,
        tier: 1,
        startedAt: FROZEN_NOW,
        declaredById: chief.personId,
        reason: 'Outage',
      },
    });
    const job = await prisma.scheduledAction.create({
      data: { eventId, type: 'authz.test', payload: {}, runAt: FROZEN_NOW },
    });
    const recorded = { recordedBy: membershipRef(volunteer.membershipId) };
    return [
      { type: 'MissionCard', id: card.id, action: 'Card.Void', attrs: {} },
      { type: 'GiftType', id: gift.id, action: 'Count.Adjust', attrs: {} },
      { type: 'FootfallTick', id: tick.id, action: 'Record.Void', attrs: recorded, station: true },
      {
        type: 'GiftRedemption',
        id: redemption.id,
        action: 'Record.Void',
        attrs: recorded,
        station: true,
      },
      {
        type: 'Incident',
        id: incident.id,
        action: 'Incident.Update',
        attrs: { reportedBy: membershipRef(volunteer.membershipId) },
      },
      { type: 'LostPersonAlert', id: alert.id, action: 'LostPerson.Resolve', attrs: {} },
      { type: 'LostFoundItem', id: item.id, action: 'LostFound.Claim', attrs: {} },
      {
        type: 'Announcement',
        id: announcement.id,
        action: 'Announcement.Ack',
        attrs: { targetRole: 'VOLUNTEER', targetStation: station(stationId) },
      },
      {
        type: 'SwapRequest',
        id: swap.id,
        action: 'Swap.Decide',
        attrs: { requester: membershipRef(volunteer.membershipId), station: station(stationId) },
      },
      {
        type: 'BriefingSlot',
        id: briefing.id,
        action: 'Briefing.Complete',
        attrs: { briefer: membershipRef(chief.membershipId) },
      },
      { type: 'VisitorRecord', id: visitor.id, action: 'VisitorRecord.Read', attrs: {} },
      // No action takes these two yet; their entities still carry the event.
      { type: 'FallbackWindow', id: fallback.id, action: null, attrs: {} },
      { type: 'ScheduledAction', id: job.id, action: null, attrs: {} },
    ] as const;
  }

  it('reads each with the attributes and parents the schema declares', async () => {
    for (const row of await rows()) {
      const request = await builder().forMembership(chief.membershipId, {
        action: row.action ?? 'Self.Read',
        resource: { type: row.type, id: row.id },
      });
      expect(entity(request, row.type, row.id), row.type).toEqual({
        uid: { type: `SPOH::${row.type}`, id: row.id },
        attrs: row.attrs,
        parents: 'station' in row ? stationParents() : [eventParent()],
      });
      if (row.action) expect(local.evaluate(request).errors, row.type).toEqual([]);
    }
  });

  it('leaves out a missing recorder, so the schema check denies the request', async () => {
    const tick = await prisma.footfallTick.create({
      data: {
        eventId,
        stationId,
        recordedById: volunteer.personId,
        idempotencyKey: idempotencyKey(),
      },
    });
    const request = await builder().forMembership(chief.membershipId, {
      action: 'Record.Void',
      resource: { type: 'FootfallTick', id: tick.id },
    });
    expect(entity(request, 'FootfallTick', tick.id).attrs).toEqual({});
    const decision = local.evaluate(request);
    expect(decision.allowed).toBe(false);
    expect(decision.errors.length).toBeGreaterThan(0);
  });

  it('names the organisation of the event only', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const request = await builder().forPerson(chief.personId, {
      action: 'Platform.CreateEvent',
      resource: { type: 'Organisation', id: event.organisationId },
    });
    expect(request.resource).toEqual({ type: 'SPOH::Organisation', id: event.organisationId });
    expect(local.evaluate(request)).toMatchObject({ allowed: false, errors: [] });
    await expect(
      builder().forPerson(chief.personId, {
        action: 'Platform.CreateEvent',
        resource: { type: 'Organisation', id: 'another-organisation' },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('a person', () => {
  it('is a platform admin only through the event’s organisation', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await prisma.organisationMembership.create({
      data: {
        organisationId: event.organisationId,
        personId: chief.personId,
        role: 'PLATFORM_ADMIN',
      },
    });
    const admin = await builder().forPerson(chief.personId, {
      action: 'Platform.AdministerEvent',
      resource: {
        type: 'Event',
        id: eventId,
      },
    });
    expect(entity(admin, 'Person', chief.personId).attrs.platformAdmin).toBe(true);
    expect(local.evaluate(admin).allowed).toBe(true);
    const nobody = await builder().forPerson(volunteer.personId, {
      action: 'Platform.AdministerEvent',
      resource: {
        type: 'Event',
        id: eventId,
      },
    });
    expect(local.evaluate(nobody).allowed).toBe(false);
  });
});

/** A second event of the same organisation, which `resetDatabase` removes. */
async function otherEvent(): Promise<string> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const created = await createEvent({
    organisationId: event.organisationId,
    slug: 'authz-other',
    name: 'Other Event',
    timezone: TEST_EVENT_TIMEZONE,
    status: 'DRAFT',
    categories: [{ code: 'OTHER', label: 'Other' }],
    stationTypes: [{ code: 'OTHER', label: 'Other' }],
    shiftTemplates: [{ code: 'DAY', label: 'Day', startLocal: '09:00', endLocal: '17:00' }],
  });
  return created.id;
}
