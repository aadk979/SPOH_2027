import { z } from 'zod';
import { Id } from '../common/index.js';

export const NoticeKind = z.enum([
  'ANNOUNCEMENT_PUBLISHED', 'LOST_PERSON_RAISED', 'LOST_PERSON_RESOLVED',
  'ASSIGNMENT_CHANGED', 'ASSIGNMENT_REMOVED', 'SWAP_APPROVED', 'SWAP_REJECTED',
  'SWAP_CANCELLED', 'FALLBACK_REMINDER', 'ARCHIVE_REMINDER', 'INCIDENT_RAISED',
  'GIFT_LOW_STOCK',
]);
export type NoticeKind = z.infer<typeof NoticeKind>;
export const NoticeSourceKind = z.enum([
  'ANNOUNCEMENT', 'LOST_PERSON', 'ASSIGNMENT', 'SWAP', 'FALLBACK', 'EVENT', 'INCIDENT', 'GIFT',
]);
export type NoticeSourceKind = z.infer<typeof NoticeSourceKind>;
export const NoticeSourceRef = z.object({ kind: NoticeSourceKind, id: Id }).strict();
export type NoticeSourceRef = z.infer<typeof NoticeSourceRef>;

/** No source body, contact detail or lost-person descriptor is duplicated into notice storage. */
export const NoticeContext = z.discriminatedUnion('type', [
  z.object({ type: z.literal('announcement') }).strict(),
  z.object({ type: z.literal('lost-person') }).strict(),
  z.object({ type: z.literal('assignment'), operation: z.enum(['ADDED', 'MOVED', 'REMOVED']),
    stationId: Id, eventDayId: Id, shiftId: Id }).strict(),
  z.object({ type: z.literal('swap') }).strict(),
  z.object({ type: z.literal('fallback'), sequence: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('event'), lifecycleVersion: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('incident') }).strict(),
  z.object({ type: z.literal('gift'), rehearsal: z.boolean(), transitionId: Id,
    transitionType: z.enum(['REDEMPTION', 'ADJUSTMENT']), threshold: z.number().int().nonnegative(),
    remaining: z.number().int() }).strict(),
]);
export type NoticeContext = z.infer<typeof NoticeContext>;

export const NOTICE_SOURCE_BY_KIND: Readonly<Record<NoticeKind, NoticeSourceKind>> = {
  ANNOUNCEMENT_PUBLISHED: 'ANNOUNCEMENT', LOST_PERSON_RAISED: 'LOST_PERSON',
  LOST_PERSON_RESOLVED: 'LOST_PERSON', ASSIGNMENT_CHANGED: 'ASSIGNMENT',
  ASSIGNMENT_REMOVED: 'ASSIGNMENT', SWAP_APPROVED: 'SWAP', SWAP_REJECTED: 'SWAP',
  SWAP_CANCELLED: 'SWAP', FALLBACK_REMINDER: 'FALLBACK', ARCHIVE_REMINDER: 'EVENT',
  INCIDENT_RAISED: 'INCIDENT', GIFT_LOW_STOCK: 'GIFT',
};
