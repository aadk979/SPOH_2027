'use client';
import { useState, type ReactNode } from 'react';
import { useRequireSession } from '@/features/session';
import { useMyEvents } from '@/features/events';
import { Button, ButtonLink, Callout, Card, Checkbox, EmptyState, ErrorState, Field, Select,
  LoadingRows } from '@/shared/ui';
import { useNoticeList } from '../centreQueries';
import { NoticeDetail } from '../components/NoticeDetail';
import { NoticePreferences } from '../components/NoticePreferences';
import type { NoticeRecord, NoticeListResponse } from '@spoh/shared';

function UnreadStatus({ meta }: { meta: NoticeListResponse['meta'] | undefined }) {
  return meta ? <p role="status">{meta.unreadCountComplete ? '' : 'At least '}{meta.unreadCount} unread</p> : null;
}

function NoticeCards({ notices }: { notices: NoticeRecord[] | undefined }) {
  if (!notices) return <LoadingRows label="Loading notifications" />;
  if (!notices.length) return <EmptyState title="No visible notices">Your current events have no notices in this view.</EmptyState>;
  return notices.map((notice) => <Card key={notice.id} className="flex flex-col gap-xs">
    <p className="text-caption">{notice.eventName} · {notice.priority.toLowerCase()} · {notice.readAt ? 'Read' : 'Unread'}</p>
    <h2 className="font-semibold">{notice.title}</h2><p>{notice.summary}</p>
    <ButtonLink href={`/notifications?notice=${encodeURIComponent(notice.id)}`} variant="quiet">View notification</ButtonLink>
  </Card>);
}

export default function NotificationCentreScreen({ noticeId }: { noticeId?: string }): ReactNode {
  const session = useRequireSession();
  if (!session) return null;
  return <main className="mx-auto flex w-full max-w-reading flex-col gap-md px-md py-lg">
    <div className="flex flex-wrap items-center justify-between gap-sm">
      <h1 className="text-title font-semibold">Notifications</h1>
      <ButtonLink href="/events" variant="quiet">Your events</ButtonLink>
    </div>
    <p>Notices from events you can currently access. Source access is checked when you open a notice.</p>
    {noticeId ? <NoticeDetail key={`${session.volunteerId}:${noticeId}`} id={noticeId} />
      : <NoticeList key={session.volunteerId} />}
    <NoticePreferences key={session.volunteerId} />
  </main>;
}
function NoticeList(): ReactNode {
  const [eventId, setEventId] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const events = useMyEvents();
  const query = useNoticeList({ ...(eventId.trim() ? { eventId: eventId.trim() } : {}), unreadOnly });
  const pages = query.data?.pages;
  const notices = pages?.flatMap((page) => page.data);
  const meta = pages?.[0]?.meta;
  return <section aria-label="Notification list" className="flex flex-col gap-sm">
    <Field id="notice-event-filter" label="Event">
      {(props) => <Select {...props} value={eventId} onChange={(event) => setEventId(event.target.value)}>
        <option value="">All accessible events</option>
        {events.data?.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </Select>}
    </Field>
    <Checkbox label="Unread only" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
    <UnreadStatus meta={meta} />
    {query.isError ? <ErrorState error={query.error} operation="Notifications" onRetry={() => void query.refetch()} />
      : <NoticeCards notices={notices} />}
    {query.hasNextPage ? <Button variant="quiet" disabled={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}>Load more notices</Button> : null}
    {pages?.some((page) => !page.meta.visibilityScanComplete) ? <Callout>More source history may remain. Load the next page when available.</Callout> : null}
  </section>;
}
