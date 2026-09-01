import { createHash, randomUUID } from 'node:crypto';
import type { CommitteeRole, ShiftBlock } from '@spoh/shared';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/lib/prisma.js';
import { createLocalAuthProvider } from '../../src/middleware/auth/localProvider.js';
import { invalidateVolunteerCache } from '../../src/middleware/auth/index.js';
import { eventDayAnchor, singaporeDateString } from '../../src/lib/time.js';

/**
 * Fixtures for the integration suite.
 *
 * Everything is created against "today" in Singapore, which the frozen clock in
 * tests/setup.ts pins to a real event day inside the MORNING block. Station
 * scoping asks "is this volunteer rostered here, in a block running now", so
 * fixtures and the code under test must agree on what now is.
 */

const issuer = createLocalAuthProvider({
  secret: env.LOCAL_AUTH_SECRET ?? 'test-secret-at-least-thirty-two-characters',
  nodeEnv: 'test',
});

export interface TestVolunteer {
  id: string;
  email: string;
  sub: string;
  role: CommitteeRole;
  token: string;
}

function subFor(email: string): string {
  return `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

export async function createEventDayToday(): Promise<{ id: string }> {
  const date = eventDayAnchor(singaporeDateString());
  return prisma.eventDay.upsert({
    where: { date },
    create: { date, label: 'Test Day', isPublicDay: true, isTourDay: false },
    update: {},
    select: { id: true },
  });
}

export async function createStation(overrides: {
  code: string;
  name?: string;
  countsEntry?: boolean;
  issuesStamp?: boolean;
  active?: boolean;
}): Promise<{ id: string; code: string }> {
  return prisma.station.upsert({
    where: { code: overrides.code },
    create: {
      code: overrides.code,
      name: overrides.name ?? overrides.code,
      kind: 'OTHER',
      countsEntry: overrides.countsEntry ?? false,
      issuesStamp: overrides.issuesStamp ?? false,
      active: overrides.active ?? true,
    },
    update: {},
    select: { id: true, code: true },
  });
}

export async function createVolunteer(input: {
  email: string;
  role: CommitteeRole;
  displayName?: string;
}): Promise<TestVolunteer> {
  const sub = subFor(input.email);

  const volunteer = await prisma.volunteer.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      displayName: input.displayName ?? input.email,
      cognitoSub: sub,
      role: input.role,
    },
    update: { role: input.role, active: true },
    select: { id: true },
  });

  // The auth middleware caches sub -> volunteer for 60 seconds; a fixture
  // rebuilt between tests must not be served from a previous test's cache.
  invalidateVolunteerCache(sub);

  const token = await issuer.issue({ sub, groups: [input.role] });

  return { id: volunteer.id, email: input.email, sub, role: input.role, token };
}

export async function assignToStation(input: {
  volunteerId: string;
  stationId: string;
  eventDayId: string;
  block?: ShiftBlock;
  roleLabel?: string;
}): Promise<{ id: string }> {
  const block = input.block ?? 'MORNING';

  return prisma.shiftAssignment.upsert({
    where: {
      volunteerId_eventDayId_block: {
        volunteerId: input.volunteerId,
        eventDayId: input.eventDayId,
        block,
      },
    },
    create: {
      volunteerId: input.volunteerId,
      stationId: input.stationId,
      eventDayId: input.eventDayId,
      block,
      roleLabel: input.roleLabel ?? 'Volunteer',
    },
    update: { stationId: input.stationId },
    select: { id: true },
  });
}

/**
 * Assign to both blocks, so a test passes regardless of the wall-clock hour it
 * runs at. Shift scoping is time-sensitive by design and the suite should not
 * be.
 */
export async function assignToStationAllBlocks(input: {
  volunteerId: string;
  stationId: string;
  eventDayId: string;
  roleLabel?: string;
}): Promise<void> {
  for (const block of ['MORNING', 'AFTERNOON'] as ShiftBlock[]) {
    await assignToStation({ ...input, block });
  }
}

export function idempotencyKey(): string {
  return randomUUID();
}

export function bearer(volunteer: TestVolunteer): string {
  return `Bearer ${volunteer.token}`;
}
