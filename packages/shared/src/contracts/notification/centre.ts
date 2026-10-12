import { z } from 'zod';
import { AnnouncementPriority } from '../../invariants/enums.js';
import { Id, IsoDateTime, PaginationQuery } from '../common/index.js';
import { WorkspaceDestination } from '../workspace/destinations.js';
import { NoticeKind } from './sources.js';

export const ListNoticesQuery = PaginationQuery.extend({ eventId: Id.optional(),
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();
export type ListNoticesQuery = z.infer<typeof ListNoticesQuery>;
export const NoticeAcknowledgement = z.object({ kind: z.enum(['ANNOUNCEMENT', 'LOST_PERSON']),
  sourceId: Id, acknowledged: z.boolean(), canAcknowledge: z.boolean() }).strict();
export const NoticeRecord = z.object({ id: Id, eventId: Id, eventName: z.string().max(200),
  eventSlug: z.string().max(100), kind: NoticeKind, priority: AnnouncementPriority,
  createdAt: IsoDateTime, readAt: IsoDateTime.nullable(), title: z.string().min(1).max(300),
  summary: z.string().max(1000), detail: z.string().max(1000).nullable(),
  destination: WorkspaceDestination.nullable(), acknowledgement: NoticeAcknowledgement.nullable(),
}).strict();
export type NoticeRecord = z.infer<typeof NoticeRecord>;
export const NoticeListResponse = z.object({ data: z.array(NoticeRecord).max(200),
  meta: z.object({ count: z.number().int().nonnegative(), nextCursor: Id.nullable(),
    unreadCount: z.number().int().nonnegative(), unreadCountComplete: z.boolean(),
    visibilityScanComplete: z.boolean() }).strict(),
}).strict();
export type NoticeListResponse = z.infer<typeof NoticeListResponse>;
export const NoticeDetailResponse = z.object({ data: NoticeRecord }).strict();
export type NoticeDetailResponse = z.infer<typeof NoticeDetailResponse>;
export const NoticeReadRequest = z.object({}).strict();
