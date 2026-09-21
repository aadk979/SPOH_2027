import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { CommitteeRole } from '@spoh/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { sensitiveRateLimit } from '../../src/middleware/rateLimit.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let root: TestVolunteer;
let exco: TestVolunteer;
let volunteer: TestVolunteer;
let assignmentId: string;
let dayId: string;
const post = (person: TestVolunteer, path: string, body = {}) =>
  request(app).post(`/api/v1${path}`).set('Authorization', bearer(person)).send(body);
async function rootCode() {
  expect((await post(root, '/attendance/start')).status).toBe(200);
  const response = await post(root, '/attendance/challenge');
  expect(response.status).toBe(200);
  return response.body as { token: string; pin: string; expiresAt: string };
}
async function excoCode() {
  const code = await rootCode();
  expect((await post(exco, '/attendance/submit', { method: 'QR', token: code.token })).status).toBe(
    200,
  );
  const response = await post(exco, '/attendance/challenge');
  expect(response.status).toBe(200);
  return response.body as { token: string; pin: string };
}
beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  app.set('trust proxy', 0);
  await resetDatabase();
  root = await createVolunteer({ email: 'root@attendance.test', role: 'ADMIN' });
  exco = await createVolunteer({ email: 'exco@attendance.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'volunteer@attendance.test', role: 'VOLUNTEER' });
  for (const person of [root, exco, volunteer]) sensitiveRateLimit.resetKey(`sub:${person.sub}`);
  dayId = (await createEventDayToday()).id;
  const station = await createStation({ code: 'ATTENDANCE' });
  assignmentId = (
    await assignToStation({ volunteerId: volunteer.id, stationId: station.id, eventDayId: dayId })
  ).id;
});

describe('verified attendance', () => {
  it('requires authentication and only the configured root can bootstrap', async () => {
    expect((await request(app).post('/api/v1/attendance/start')).status).toBe(401);
    expect((await post(exco, '/attendance/start')).status).toBe(403);
    const admin = await createVolunteer({ email: 'other-admin@test.test', role: 'ADMIN' });
    expect((await post(admin, '/attendance/start')).status).toBe(403);
    await rootCode();
    expect(await prisma.attendance.count()).toBe(1);
  });
  it.each<CommitteeRole>(['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR', 'IC'])(
    'requires root verification for %s before issuing codes',
    async (role) => {
      const person = await createVolunteer({ email: `${role}@attendance.test`, role });
      expect((await post(person, '/attendance/challenge')).status).toBe(403);
      const code = await rootCode();
      expect(
        (await post(person, '/attendance/submit', { method: 'QR', token: code.token })).status,
      ).toBe(200);
      expect((await post(person, '/attendance/challenge')).status).toBe(200);
    },
  );
  it('verifies root → exco → volunteer, synchronizes shifts, and audits without secrets', async () => {
    const code = await excoCode();
    const response = await post(volunteer, '/attendance/submit', {
      method: 'QR',
      token: code.token,
    });
    expect(response.status).toBe(200);
    expect(response.body.attendance.method).toBe('QR');
    expect(
      (await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).checkedInAt,
    ).not.toBeNull();
    expect(
      (
        await prisma.attendance.findUniqueOrThrow({
          where: { volunteerId_eventDayId: { volunteerId: volunteer.id, eventDayId: dayId } },
        })
      ).verifiedById,
    ).toBe(exco.id);
    expect((await post(volunteer, '/attendance/challenge')).status).toBe(403);
    const audit = JSON.stringify(await prisma.auditLog.findMany());
    expect(audit).not.toContain(code.token);
    expect(audit).not.toContain(code.pin);
    expect(
      (
        await prisma.attendanceChallenge.findUniqueOrThrow({
          where: { issuerId_eventDayId: { issuerId: exco.id, eventDayId: dayId } },
        })
      ).pinHash,
    ).not.toBe(code.pin);
  });
  it('prevents exco-to-exco verification and using an ordinary login token as an attendance token', async () => {
    const code = await excoCode();
    const other = await createVolunteer({ email: 'another-exco@attendance.test', role: 'LEAD' });
    expect(
      (await post(other, '/attendance/submit', { method: 'QR', token: code.token })).status,
    ).toBe(403);
    expect((await post(other, '/attendance/submit', { method: 'PIN', pin: code.pin })).status).toBe(
      403,
    );
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'QR', token: root.token })).status,
    ).toBe(403);
  });
  it('blocks QR on mobile data but accepts the secondary PIN without scanning', async () => {
    const code = await rootCode();
    app.set('trust proxy', 1); // Test-only trusted ingress, to exercise the peer IP check.
    expect(
      (
        await post(volunteer, '/attendance/submit', { method: 'QR', token: code.token }).set(
          'X-Forwarded-For',
          '198.51.100.20',
        )
      ).status,
    ).toBe(403);
    const result = await post(volunteer, '/attendance/submit', {
      method: 'PIN',
      pin: code.pin,
    }).set('X-Forwarded-For', '198.51.100.20');
    expect(result.status).toBe(200);
    expect(result.body.attendance.method).toBe('PIN');
  });
  it('also requires the QR issuer to be on campus, while allowing their PIN', async () => {
    await post(root, '/attendance/start');
    app.set('trust proxy', 1);
    const code = await post(root, '/attendance/challenge').set('X-Forwarded-For', '198.51.100.20');
    expect(code.body.qrEnabled).toBe(false);
    expect(
      (await post(exco, '/attendance/submit', { method: 'QR', token: code.body.token })).status,
    ).toBe(403);
    expect(
      (await post(exco, '/attendance/submit', { method: 'PIN', pin: code.body.pin })).status,
    ).toBe(200);
  });
  it('invalidates rotated QR/PIN pairs and checks expiry for both methods', async () => {
    const old = await rootCode();
    const current = await post(root, '/attendance/challenge');
    expect(
      (await post(exco, '/attendance/submit', { method: 'QR', token: old.token })).status,
    ).toBe(403);
    expect((await post(exco, '/attendance/submit', { method: 'PIN', pin: old.pin })).status).toBe(
      403,
    );
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 300_000));
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'QR', token: current.body.token }))
        .status,
    ).toBe(403);
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'PIN', pin: current.body.pin }))
        .status,
    ).toBe(403);
  });
  it('rejects deactivated and demoted issuers even when the signature remains valid', async () => {
    const code = await excoCode();
    await prisma.volunteer.update({ where: { id: exco.id }, data: { active: false } });
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'QR', token: code.token })).status,
    ).toBe(403);
    await prisma.volunteer.update({
      where: { id: exco.id },
      data: { active: true, role: 'VOLUNTEER' },
    });
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'PIN', pin: code.pin })).status,
    ).toBe(403);
  });
  it('rejects codes on another event day and prevents legacy check-in bypass', async () => {
    expect((await post(volunteer, '/me/check-in', { assignmentId })).status).toBe(403);
    const code = await rootCode();
    vi.setSystemTime(new Date('2027-01-08T03:30:00Z'));
    await createEventDayToday();
    volunteer = await createVolunteer({ email: volunteer.email, role: 'VOLUNTEER' });
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'PIN', pin: code.pin })).status,
    ).toBe(403);
  });
  it('deduplicates simultaneous submissions and keeps one attendance audit', async () => {
    const code = await rootCode();
    const responses = await Promise.all(
      [1, 2, 3].map(() => post(volunteer, '/attendance/submit', { method: 'PIN', pin: code.pin })),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(new Set(responses.map((response) => response.body.attendance.id)).size).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { actorId: volunteer.id, action: 'attendance.present' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { actorId: volunteer.id, action: 'shift.checkIn' } }),
    ).toBe(1);
  });
  it('persists failed PIN attempts and locks the account after five attempts', async () => {
    const code = await rootCode();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await post(volunteer, '/attendance/submit', {
            method: 'PIN',
            pin: '9999999999' === code.pin ? '0000000000' : '9999999999',
          })
        ).status,
      ).toBe(403);
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'PIN', pin: code.pin })).status,
    ).toBe(429);
    expect(
      (await prisma.attendanceAttempt.findUniqueOrThrow({ where: { volunteerId: volunteer.id } }))
        .attempts,
    ).toBe(5);
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 300_001));
    const fresh = await post(root, '/attendance/challenge');
    expect(
      (await post(volunteer, '/attendance/submit', { method: 'PIN', pin: fresh.body.pin })).status,
    ).toBe(200);
  });
});
