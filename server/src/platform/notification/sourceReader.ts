import type { AnnouncementPriority, NoticeContext, NoticeKind, NoticeSourceKind,
  NoticeSourceRef, NotificationKind, WorkspaceDestination } from '@spoh/shared';
import type { ReadContext } from '../access/currentRead.js';

export interface NoticeSourceInput {
  readonly noticeId: string;
  readonly kind: NoticeKind;
  readonly priority: AnnouncementPriority;
  readonly source: NoticeSourceRef;
  readonly transitionKey: string;
  readonly recipientPersonId: string;
  readonly recipientMembershipId: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly context: NoticeContext;
}
export interface VisibleNoticeSource {
  readonly title: string;
  readonly summary: string;
  readonly detail: string | null;
  readonly destination: WorkspaceDestination | null;
  readonly acknowledgement: null | {
    readonly kind: 'ANNOUNCEMENT' | 'LOST_PERSON'; readonly sourceId: string;
    readonly acknowledged: boolean; readonly canAcknowledge: boolean;
  };
  readonly push: null | {
    readonly kind: NotificationKind; readonly priority: AnnouncementPriority;
    readonly title: string; readonly body: string; readonly tag: string;
    readonly validUntil: Date | null;
  };
}
/** Source-owned projection rechecks current authority before fetching a private body. */
export type NoticeSourceReader = (context: ReadContext, input: NoticeSourceInput) => Promise<VisibleNoticeSource | null>;
export type NoticeSourceReaders = Readonly<Record<NoticeSourceKind, NoticeSourceReader>>;
