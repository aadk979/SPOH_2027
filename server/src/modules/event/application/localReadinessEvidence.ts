import { CommitteeRole, MembershipStatus } from '@spoh/shared';
import { z } from 'zod';
import { resolveSetting } from '../../../platform/settings/resolve.js';
import type { ReadinessEvidence } from '../domain/readiness/index.js';
import { notificationReadinessFacts } from './notificationReadinessFacts.js';

const LocalSnapshot = z
  .object({
    eventId: z.string().min(1),
    coverage: z.unknown(),
    categories: z.unknown(),
    cardBatch: z.unknown(),
    giftStock: z.unknown(),
    attendance: z.unknown(),
    rolePermissions: z.unknown().optional(),
    notifications: z.unknown().optional(),
  })
  .strict();
const AttendanceSnapshot = z
  .object({
    rootValue: z.unknown(),
    networksValue: z.unknown(),
    root: z
      .object({ id: z.string().min(1), role: CommitteeRole, status: MembershipStatus })
      .strict()
      .nullable(),
  })
  .strict();

function attendanceFacts(value: unknown) {
  const parsed = AttendanceSnapshot.safeParse(value);
  if (!parsed.success) return undefined;
  const raw = parsed.data;
  const rootId = resolveSetting('attendance.rootMembershipId', [
    { scope: 'event', value: raw.rootValue, version: 0 },
  ]).value;
  const networks = resolveSetting('attendance.campusCidrs', [
    { scope: 'event', value: raw.networksValue, version: 0 },
  ]).value as string[];
  const root =
    raw.root && raw.root.id === rootId ? { role: raw.root.role, status: raw.root.status } : null;
  return { root, validatedTrustedNetworks: networks.length };
}

/** The five real local facts are present; nonexistent domains are never fabricated. */
export function localReadinessEvidence(value: unknown, eventId: string): ReadinessEvidence {
  const parsed = LocalSnapshot.safeParse(value);
  if (!parsed.success || parsed.data.eventId !== eventId) return {};
  const snapshot = parsed.data;
  const envelope = (facts: unknown) => ({ eventId, facts });
  const attendance = attendanceFacts(snapshot.attendance);
  return {
    'shift-coverage': envelope(snapshot.coverage),
    categories: envelope(snapshot.categories),
    'card-batch': envelope(snapshot.cardBatch),
    'gift-stock': envelope(snapshot.giftStock),
    ...(attendance === undefined ? {} : { attendance: envelope(attendance) }),
    ...(snapshot.rolePermissions === undefined
      ? {}
      : { 'role-permissions': envelope(snapshot.rolePermissions) }),
    ...(snapshot.notifications === undefined
      ? {}
      : { notifications: envelope(notificationReadinessFacts(snapshot.notifications)) }),
  };
}
