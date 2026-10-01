import { z } from 'zod';
import { AttendanceMethod } from '../../invariants/enums.js';
import { Id, IsoDateTime } from '../common/index.js';

export const AttendanceProof = z.discriminatedUnion('method', [
  z.object({ method: z.literal('QR'), token: z.string().min(1).max(2048) }).strict(),
  z.object({ method: z.literal('PIN'), pin: z.string().regex(/^\d{10}$/) }).strict(),
]);
export type AttendanceProof = z.infer<typeof AttendanceProof>;

export const AttendanceRecord = z.object({
  id: Id,
  presentAt: IsoDateTime,
  method: AttendanceMethod,
  verifiedByName: z.string().nullable(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecord>;

export const AttendanceStatus = z.object({
  eventDay: z.object({ id: Id, label: z.string() }).nullable(),
  configured: z.boolean(),
  isRoot: z.boolean(),
  isExco: z.boolean(),
  onCampusNetwork: z.boolean(),
  networkConfigured: z.boolean(),
  attendance: AttendanceRecord.nullable(),
  canIssue: z.boolean(),
  serverTime: IsoDateTime,
});
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const AttendanceChallenge = z.object({
  token: z.string(),
  pin: z.string(),
  expiresAt: IsoDateTime,
  serverTime: IsoDateTime,
  qrEnabled: z.boolean(),
});
export type AttendanceChallenge = z.infer<typeof AttendanceChallenge>;

/** Event attendance setup, visible only to people who can manage configuration. */
export const AttendanceCidrs = z.array(z.string().trim().min(1).max(64)).max(20);
export type AttendanceCidrs = z.infer<typeof AttendanceCidrs>;

export const AttendanceConfig = z.object({
  rootMembershipId: Id.nullable(),
  rootIsStale: z.boolean(),
  campusCidrs: AttendanceCidrs,
  versions: z.object({ rootMembershipId: z.number().int(), campusCidrs: z.number().int() }),
  eligibleRoots: z.array(z.object({ id: Id, displayName: z.string(), email: z.string() })),
});
export type AttendanceConfig = z.infer<typeof AttendanceConfig>;

export const ChangeAttendanceConfigRequest = z.discriminatedUnion('key', [
  z
    .object({
      key: z.literal('attendance.rootMembershipId'),
      value: Id.nullable(),
      expectedVersion: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      key: z.literal('attendance.campusCidrs'),
      value: AttendanceCidrs,
      expectedVersion: z.number().int().min(0),
    })
    .strict(),
]);
export type ChangeAttendanceConfigRequest = z.infer<typeof ChangeAttendanceConfigRequest>;

export const TestAttendanceNetworkRequest = z.object({ cidrs: AttendanceCidrs }).strict();
export type TestAttendanceNetworkRequest = z.infer<typeof TestAttendanceNetworkRequest>;
export const TestAttendanceNetworkResponse = z.object({
  ip: z.string().nullable(),
  trusted: z.boolean(),
});
export type TestAttendanceNetworkResponse = z.infer<typeof TestAttendanceNetworkResponse>;
