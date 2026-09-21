import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';

export const AttendanceProof = z.discriminatedUnion('method', [
  z.object({ method: z.literal('QR'), token: z.string().min(1).max(2048) }).strict(),
  z.object({ method: z.literal('PIN'), pin: z.string().regex(/^\d{10}$/) }).strict(),
]);
export type AttendanceProof = z.infer<typeof AttendanceProof>;

export const AttendanceRecord = z.object({
  id: Id,
  presentAt: IsoDateTime,
  method: z.enum(['ROOT', 'QR', 'PIN']),
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
