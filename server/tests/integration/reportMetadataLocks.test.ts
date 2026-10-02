import { beforeEach, expect, it } from 'vitest';
import { createStation as createStationUseCase } from '../../src/modules/station/application/createStation.js';
import { updateStation } from '../../src/modules/station/application/updateStation.js';
import { createEventDay } from '../../src/modules/eventDays/application/createEventDay.js';
import { updateEventDay } from '../../src/modules/eventDays/application/updateEventDay.js';
import { updateShiftTemplate } from '../../src/modules/eventDays/application/updateShiftTemplate.js';
import { createAssignment } from '../../src/modules/assignments/application/createAssignment.js';
import { deleteAssignment } from '../../src/modules/assignments/application/deleteAssignment.js';
import { checkIn } from '../../src/modules/me/application/checkIn.js';
import { checkOut } from '../../src/modules/me/application/checkOut.js';
import { startAttendance } from '../../src/modules/attendance/application/startAttendance.js';
import { issueChallenge } from '../../src/modules/attendance/application/issueChallenge.js';
import { submitAttendance } from '../../src/modules/attendance/application/submitAttendance.js';
import { updateVolunteer } from '../../src/modules/people/application/updateVolunteer.js';
import { deactivateVolunteer } from '../../src/modules/people/application/deactivateVolunteer.js';
import { reactivateVolunteer } from '../../src/modules/people/application/reactivateVolunteer.js';
import { provisionVolunteer } from '../../src/modules/roster/application/provisionVolunteer.js';
import { importRoster } from '../../src/modules/roster/application/importRoster.js';
import { decideSwap } from '../../src/modules/shift/application/decideSwap.js';
import { purgeResolvedAlerts } from '../../src/modules/lostPerson/application/purgeResolvedAlerts.js';
import { changeEventSetting } from '../../src/modules/settings/application/changeEventSetting.js';
import { changeSetting, resetSetting, revertSetting } from '../../src/platform/settings/change.js';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let dayId: string;
let stationId: string;
let templateId: string;
let shiftId: string;
let assignmentId: string;
let swapId: string;
let admin: TestVolunteer;
let volunteer: TestVolunteer;
let target: TestVolunteer;
let adminActor: ActorContext;
let volunteerActor: ActorContext;

async function actorFor(person: TestVolunteer): Promise<ActorContext> {
  const member = await rawDb.eventMembership.findFirstOrThrow({
    where: { eventId, personId: person.id },
  });
  return {
    scope: { eventId },
    volunteerId: person.id,
    membershipId: member.id,
    audit: {
      eventId,
      actorId: person.id,
      actorSub: person.sub,
      membershipId: member.id,
      ip: null,
      userAgent: null,
      requestId: null,
    },
  };
}

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'admin@metadata-lock.test', role: 'ADMIN' });
  target = await createVolunteer({ email: 'target@metadata-lock.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'volunteer@metadata-lock.test', role: 'VOLUNTEER' });
  adminActor = await actorFor(admin);
  volunteerActor = await actorFor(volunteer);
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'META' })).id;
  assignmentId = (
    await assignToStation({ volunteerId: volunteer.id, stationId, eventDayId: dayId })
  ).id;
  const assignment = await rawDb.shiftAssignment.findFirstOrThrow({
    where: { eventId, id: assignmentId },
  });
  shiftId = assignment.shiftId;
  templateId = (await rawDb.shift.findFirstOrThrow({ where: { eventId, id: shiftId } }))
    .templateId!;
  swapId = (
    await rawDb.shiftSwapRequest.create({
      data: { eventId, assignmentId, requesterId: volunteer.id, targetId: target.id },
    })
  ).id;
  await rawDb.setting.create({
    data: {
      eventId,
      scope: 'EVENT',
      scopeId: eventId,
      key: 'attendance.rootMembershipId',
      value: adminActor.membershipId,
      version: 1,
    },
  });
  await rawDb.lostPersonAlert.create({
    data: {
      eventId,
      raisedById: volunteer.id,
      descriptionText: 'Resolved lock drill',
      status: 'RESOLVED_FOUND',
      raisedAt: new Date(FROZEN_NOW.getTime() - 30 * 3600_000),
      resolvedAt: new Date(FROZEN_NOW.getTime() - 25 * 3600_000),
    },
  });
});

const manager = () => ({ ...adminActor, role: 'ADMIN' as const });
const rosterActor = () => ({ ...manager(), mayProvision: true });
const settingInput = () => ({
  target: { scope: 'event' as const, eventId },
  key: 'silentStationMinutes' as const,
  actorPersonId: admin.id,
  audit: adminActor.audit,
});
async function present(person: TestVolunteer) {
  await rawDb.attendance.create({
    data: {
      eventId,
      volunteerId: person.id,
      eventDayId: dayId,
      method: 'ROOT',
      presentAt: FROZEN_NOW,
    },
  });
}
async function storedSetting(version: number) {
  await rawDb.setting.create({
    data: {
      eventId,
      scope: 'EVENT',
      scopeId: eventId,
      key: 'silentStationMinutes',
      value: 20,
      version,
    },
  });
  await rawDb.settingChange.createMany({
    data: Array.from({ length: version }, (_, i) => ({
      eventId,
      scope: 'EVENT' as const,
      scopeId: eventId,
      key: 'silentStationMinutes',
      after: i === 0 ? 15 : 20,
      version: i + 1,
      source: 'USER' as const,
    })),
  });
}

interface MutationCase {
  name: string;
  prepare?: () => Promise<unknown>;
  run: () => Promise<unknown>;
}
const cases: MutationCase[] = [
  {
    name: 'station create',
    run: () =>
      createStationUseCase(
        { code: 'NEW', name: 'New station', typeCode: 'OTHER', tagCodes: [], sortOrder: 0 },
        adminActor,
      ),
  },
  {
    name: 'station update',
    run: () => updateStation(stationId, { name: 'Renamed station' }, adminActor),
  },
  {
    name: 'day create',
    run: () =>
      createEventDay(
        { date: '2027-01-08', label: 'New day', isPublicDay: true, isTourDay: false },
        adminActor,
      ),
  },
  { name: 'day update', run: () => updateEventDay(dayId, { label: 'Renamed day' }, adminActor) },
  {
    name: 'template update',
    run: () => updateShiftTemplate(templateId, { label: 'Renamed shift' }, adminActor),
  },
  {
    name: 'assignment create',
    run: () =>
      createAssignment(
        { volunteerId: volunteer.id, stationId, shiftId, roleLabel: 'Counter' },
        adminActor,
      ),
  },
  { name: 'assignment delete', run: () => deleteAssignment(assignmentId, adminActor) },
  {
    name: 'shift check-in',
    prepare: () => present(volunteer),
    run: () => checkIn(assignmentId, volunteerActor),
  },
  {
    name: 'shift check-out',
    prepare: () =>
      rawDb.shiftAssignment.update({
        where: { eventId, id: assignmentId },
        data: { checkedInAt: FROZEN_NOW },
      }),
    run: () => checkOut(assignmentId, volunteerActor),
  },
  { name: 'attendance start', run: () => startAttendance(adminActor) },
  {
    name: 'attendance challenge',
    prepare: () => present(admin),
    run: () => issueChallenge(adminActor),
  },
  {
    name: 'attendance submit',
    prepare: () => present(volunteer),
    run: () => submitAttendance({ method: 'PIN', pin: '0000000000' }, volunteerActor),
  },
  {
    name: 'person update',
    run: () => updateVolunteer(target.id, { displayName: 'Renamed member' }, manager()),
  },
  {
    name: 'person deactivate',
    run: () =>
      deactivateVolunteer(target.id, { reason: 'Lock drill', disableIdentity: false }, manager()),
  },
  {
    name: 'person reactivate',
    prepare: () =>
      rawDb.eventMembership.update({
        where: { eventId_personId: { eventId, personId: target.id } },
        data: { status: 'DEACTIVATED', deactivatedAt: FROZEN_NOW },
      }),
    run: () => reactivateVolunteer(target.id, manager()),
  },
  {
    name: 'roster provision',
    run: () =>
      provisionVolunteer(
        { displayName: 'Renamed member', email: target.email, role: 'IC' },
        rosterActor(),
      ),
  },
  {
    name: 'roster import',
    run: () =>
      importRoster(
        {
          rows: [{ displayName: 'Renamed member', email: target.email, role: 'IC' }],
          commit: true,
        },
        rosterActor(),
      ),
  },
  { name: 'swap approval', run: () => decideSwap(swapId, { decision: 'APPROVED' }, adminActor) },
  { name: 'resolved-alert purge', run: () => purgeResolvedAlerts(FROZEN_NOW) },
  {
    name: 'setting change',
    run: () => changeSetting({ ...settingInput(), expectedVersion: 0, value: 20 }),
  },
  {
    name: 'setting reset',
    prepare: () => storedSetting(1),
    run: () => resetSetting({ ...settingInput(), expectedVersion: 1 }),
  },
  {
    name: 'setting revert',
    prepare: () => storedSetting(2),
    run: () => revertSetting({ ...settingInput(), expectedVersion: 2, toVersion: 1 }),
  },
  {
    name: 'legacy count setting',
    run: () =>
      changeEventSetting(
        {
          key: 'product.countsMode',
          value: { mode: 'headline', source: { count: 'registrations' } },
          expectedVersion: 0,
        },
        adminActor,
      ),
  },
];

it.each(cases)(
  '$name waits for the lifecycle lock before changing report data',
  async ({ prepare, run }) => {
    await prepare?.();
    const before = await rawDb.auditLog.count({ where: { eventId } });
    let unlock!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const lifecycle = rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      entered();
      await release;
    });
    await ready;
    const mutation = run();
    try {
      await expect
        .poll(
          async () => {
            const rows = await rawDb.$queryRaw<
              Array<{ count: bigint }>
            >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR%'`;
            return Number(rows[0]?.count ?? 0);
          },
          { timeout: 2000 },
        )
        .toBe(1);
      expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(before);
    } finally {
      unlock();
      await lifecycle;
      await mutation;
    }
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBeGreaterThan(before);
  },
);

it('an attendance mutation waits for the event before taking its person lock', async () => {
  let unlock!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const lifecycle = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    entered();
    await release;
  });
  await ready;
  const attendance = startAttendance(adminActor);
  try {
    await expect
      .poll(
        async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
          return Number(rows[0]?.count ?? 0);
        },
        { timeout: 2000 },
      )
      .toBe(1);
    // Probe the same advisory lock used by attendance, rather than the Person row.
    await rawDb.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`attendance:${admin.id}`}, 0)) AS acquired`;
      expect(rows[0]?.acquired).toBe(true);
    });
  } finally {
    unlock();
    await lifecycle;
    await attendance;
  }
});
