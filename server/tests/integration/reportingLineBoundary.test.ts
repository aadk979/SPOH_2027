import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { updateVolunteer } from '../../src/modules/people/application/updateVolunteer.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, membershipOf, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let admin: TestVolunteer;
let first: TestVolunteer;
let second: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'graph-admin@example.test', role: 'ADMIN' });
  first = await createVolunteer({ email: 'graph-first@example.test', role: 'VOLUNTEER' });
  second = await createVolunteer({ email: 'graph-second@example.test', role: 'VOLUNTEER' });
});
// Drive the real use case after preflight, without an earlier HTTP receipt FK wait.
async function change(person: TestVolunteer, manager: TestVolunteer) {
  const member = await membershipOf(admin.id);
  try {
    await updateVolunteer(person.id, { reportsToId: manager.id, idempotencyKey: randomUUID() }, {
      volunteerId: admin.id, role: 'ADMIN', scope: { eventId },
      audit: { ...SYSTEM_AUDIT_CONTEXT, actorId: admin.id, actorSub: admin.sub, eventId, membershipId: member.id },
    });
    return { status: 200 };
  } catch (error) { return { status: (error as { statusCode?: number }).statusCode ?? 500 }; }
}

async function holdEvent() {
  let entered!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const transaction = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    entered(); await held;
  }, { timeout: 15_000 });
  await locked;
  return { release, transaction };
}
async function waiting(count: number) {
  await expect.poll(async () => {
    const [row] = await rawDb.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR %'`;
    return Number(row!.waiting);
  }).toBeGreaterThanOrEqual(count);
}

it('serialises competing reporting links and rejects a cycle that formed after both preflights', async () => {
  const held = await holdEvent();
  const one = Promise.resolve(change(first, second));
  const two = Promise.resolve(change(second, first));
  try { await waiting(2); } finally { held.release(); await Promise.all([one, two]); }
  await held.transaction;
  const results = await Promise.all([one, two]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await rawDb.eventMembership.count({ where: { eventId, personId: { in: [first.id, second.id] }, reportsToId: { not: null } } })).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'user.update' } })).toBe(1);
});

it('rechecks a manager that becomes globally inactive after the initial graph validation', async () => {
  let entered!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const transaction = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    entered(); await held;
    await tx.person.update({ where: { id: second.id }, data: { deactivatedAt: FROZEN_NOW } });
  }, { timeout: 15_000 });
  await locked;
  const running = Promise.resolve(change(first, second));
  try { await waiting(1); } finally { release(); await running; }
  await transaction;
  expect((await running).status).toBe(404);
  expect((await membershipOf(first.id)).reportsToId).toBeNull();
  expect(await rawDb.auditLog.count({ where: { action: 'user.update' } })).toBe(0);
});
