import { beforeAll, describe, expect, it } from 'vitest';
import { createEvent } from '../../src/modules/event/index.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  categoryId,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  membershipOf,
  testEvent,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * ADR-001 "How it is tested" (3), from P09.10: the database itself keeps a
 * row inside its event. For each parent, a row in event A that points at
 * event B's parent is refused with a foreign-key violation, whatever the
 * application above it does.
 */

interface Side {
  eventId: string;
  person: string;
  membership: string;
  day: string;
  station: string;
  type: string;
  tag: string;
  category: string;
  template: string;
  shift: string;
  assignment: string;
  card: string;
  gift: string;
  incident: string;
  alert: string;
  announcement: string;
}

let a: Side;
let b: Side;

async function sideA(): Promise<Side> {
  const { eventId } = await testEvent();
  const day = (await createEventDayToday()).id;
  const station = (await createStation({ code: 'A_DESK' })).id;
  const person = (await createVolunteer({ email: 'a@keys.test', role: 'VOLUNTEER' })).id;
  return {
    ...(await commonRows({ eventId, person, day, station })),
    eventId,
    person,
    day,
    station,
  };
}

async function sideB(): Promise<Side> {
  const organisation = await rawDb.organisation.findFirstOrThrow();
  const event = await createEvent({
    organisationId: organisation.id,
    slug: 'event-keys-b',
    name: 'Event B',
    timezone: 'Asia/Singapore',
    status: 'LIVE',
    categories: [{ code: 'SEC_1', label: 'Sec 1' }],
    stationTypes: [{ code: 'DESK', label: 'Desk', registersVisitors: true }],
    shiftTemplates: [{ code: 'MORNING', label: 'Morning', startLocal: '09:30', endLocal: '14:00' }],
  });
  const eventId = event.id;
  const person = (
    await rawDb.person.create({
      data: { email: 'b@keys.test', displayName: 'B', cognitoSub: 'local:b@keys.test' },
    })
  ).id;
  await rawDb.eventMembership.create({ data: { eventId, personId: person } });
  const day = (
    await rawDb.eventDay.create({
      data: { eventId, date: eventDayAnchor('2027-01-08'), label: 'B day' },
    })
  ).id;
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId } });
  const station = (
    await rawDb.station.create({ data: { eventId, typeId: type.id, code: 'B_DESK', name: 'B' } })
  ).id;
  return {
    ...(await commonRows({ eventId, person, day, station })),
    eventId,
    person,
    day,
    station,
  };
}

/** The rest of a side's parents, made the same way in both events. */
async function commonRows(side: { eventId: string; person: string; day: string; station: string }) {
  const { eventId, person, day, station } = side;
  const at = FROZEN_NOW;
  const template = await rawDb.shiftTemplate.findFirstOrThrow({ where: { eventId } });
  const shift =
    (await rawDb.shift.findFirst({
      where: { eventId, eventDayId: day },
      orderBy: { startsAt: 'asc' },
    })) ??
    (await rawDb.shift.create({
      data: { eventId, eventDayId: day, templateId: template.id, startsAt: at, endsAt: at },
    }));
  const membership = await rawDb.eventMembership.findUniqueOrThrow({
    where: { eventId_personId: { eventId, personId: person } },
  });
  const suffix = eventId.slice(-6).toUpperCase();
  return {
    membership: membership.id,
    type: (await rawDb.station.findUniqueOrThrow({ where: { id: station } })).typeId,
    tag: (await rawDb.stationTag.create({ data: { eventId, code: 'TAG', label: 'Tag' } })).id,
    category: (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } })).id,
    template: template.id,
    shift: shift.id,
    assignment: (
      await rawDb.shiftAssignment.create({
        data: {
          eventId,
          volunteerId: person,
          stationId: station,
          eventDayId: day,
          shiftId: shift.id,
          roleLabel: 'Desk',
        },
      })
    ).id,
    card: (
      await rawDb.missionCard.create({
        data: { eventId, shortCode: `K${suffix}`, qrPayload: `keys-${eventId}` },
      })
    ).id,
    gift: (await rawDb.giftType.create({ data: { eventId, name: 'Tote', initialStock: 1 } })).id,
    incident: (
      await rawDb.incident.create({
        data: {
          eventId,
          type: 'ILLNESS',
          severity: 'LOW',
          description: 'x',
          reportedById: person,
          occurredAt: at,
          idempotencyKey: idempotencyKey(),
        },
      })
    ).id,
    alert: (await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: person } })).id,
    announcement: (
      await rawDb.announcement.create({ data: { eventId, body: 'x', authorId: person } })
    ).id,
  };
}

beforeAll(async () => {
  await resetDatabase();
  a = await sideA();
  b = await sideB();
});

/** A row of event A naming one of event B's parents; each must be refused. */
const CROSSINGS: Record<string, () => Promise<unknown>> = {
  EventDay: () =>
    rawDb.briefingSlot.create({
      data: { eventId: a.eventId, eventDayId: b.day, startsAt: FROZEN_NOW },
    }),
  Station: () =>
    rawDb.footfallTick.create({
      data: {
        eventId: a.eventId,
        stationId: b.station,
        recordedById: a.person,
        idempotencyKey: idempotencyKey(),
      },
    }),
  StationType: () =>
    rawDb.station.create({
      data: { eventId: a.eventId, typeId: b.type, code: 'CROSS', name: 'Cross' },
    }),
  StationTag: () =>
    rawDb.stationTagging.create({
      data: { eventId: a.eventId, stationId: a.station, tagId: b.tag },
    }),
  CaptureCategory: () =>
    rawDb.registration.create({
      data: {
        eventId: a.eventId,
        categoryId: b.category,
        stationId: a.station,
        recordedById: a.person,
        idempotencyKey: idempotencyKey(),
      },
    }),
  ShiftTemplate: () =>
    rawDb.shift.create({
      data: {
        eventId: a.eventId,
        eventDayId: a.day,
        templateId: b.template,
        startsAt: FROZEN_NOW,
        endsAt: FROZEN_NOW,
      },
    }),
  Shift: () =>
    rawDb.shiftAssignment.create({
      data: {
        eventId: a.eventId,
        volunteerId: a.person,
        stationId: a.station,
        eventDayId: a.day,
        shiftId: b.shift,
        roleLabel: 'Cross',
      },
    }),
  ShiftAssignment: () =>
    rawDb.shiftSwapRequest.create({
      data: {
        eventId: a.eventId,
        assignmentId: b.assignment,
        requesterId: a.person,
        targetId: a.person,
      },
    }),
  MissionCard: () =>
    rawDb.cardStampEvent.create({
      data: {
        eventId: a.eventId,
        missionCardId: b.card,
        stationId: a.station,
        recordedById: a.person,
        idempotencyKey: idempotencyKey(),
      },
    }),
  GiftType: () =>
    rawDb.giftStockAdjustment.create({
      data: {
        eventId: a.eventId,
        giftTypeId: b.gift,
        delta: 1,
        reason: 'cross',
        createdById: a.person,
      },
    }),
  Incident: () =>
    rawDb.incidentFollowUp.create({
      data: { eventId: a.eventId, incidentId: b.incident, note: 'x', authorId: a.person },
    }),
  LostPersonAlert: () =>
    rawDb.lostPersonAck.create({
      data: { eventId: a.eventId, alertId: b.alert, volunteerId: a.person },
    }),
  Announcement: () =>
    rawDb.announcementAck.create({
      data: { eventId: a.eventId, announcementId: b.announcement, volunteerId: a.person },
    }),
  EventMembership: () =>
    rawDb.registration.create({
      data: {
        eventId: a.eventId,
        categoryId: a.category,
        stationId: a.station,
        recordedById: a.person,
        recordedByMembershipId: b.membership,
        idempotencyKey: idempotencyKey(),
      },
    }),
};

describe('composite foreign keys (ADR-001 §2, P09.10)', () => {
  it.each(Object.keys(CROSSINGS))(
    "refuses a row in one event naming another event's %s",
    async (parent) => {
      await expect((CROSSINGS[parent] as () => Promise<unknown>)()).rejects.toMatchObject({
        code: 'P2003',
      });
    },
  );

  it('accepts the same rows inside one event', async () => {
    await expect(
      rawDb.registration.create({
        data: {
          eventId: a.eventId,
          categoryId: await categoryId('SEC_1'),
          stationId: a.station,
          recordedById: a.person,
          recordedByMembershipId: (await membershipOf(a.person)).id,
          idempotencyKey: idempotencyKey(),
        },
      }),
    ).resolves.toMatchObject({ eventId: a.eventId });
  });
});
