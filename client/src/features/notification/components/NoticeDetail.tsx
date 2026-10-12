'use client';
import type { ReactNode } from 'react';
import { Button, ButtonLink, Card, ErrorState, LoadingRows, MutationFeedback } from '@/shared/ui';
import { useMarkNoticeRead, useNoticeDetail } from '../centreQueries';
import { noticeDestination } from '../model/noticeDestination';

export function NoticeDetail({ id }: { id: string }): ReactNode {
  const query = useNoticeDetail(id);
  const mark = useMarkNoticeRead();
  if (query.isError) return <ErrorState error={query.error} operation="Notification" onRetry={() => void query.refetch()}
    back={<ButtonLink href="/notifications" variant="quiet">Back to notifications</ButtonLink>} />;
  if (!query.data) return <LoadingRows label="Loading notification" />;
  const notice = query.data.data;
  const destination = noticeDestination(notice);
  const ack = notice.acknowledgement;
  return <Card className="flex flex-col gap-sm">
    <p className="text-caption">{notice.eventName} · {notice.priority.toLowerCase()} · {notice.readAt ? 'Read' : 'Unread'}</p>
    <h2 className="text-tagline font-semibold">{notice.title}</h2>
    <p className="whitespace-pre-wrap">{notice.detail ?? notice.summary}</p>
    {ack ? <p>{ack.acknowledged ? 'Source acknowledgement recorded.' : ack.canAcknowledge
      ? 'Acknowledgement is still required. Open the source to acknowledge it.' : 'No acknowledgement is available with your current access.'}</p> : null}
    {destination ? <ButtonLink href={destination}>Open source</ButtonLink> : null}
    {!notice.readAt ? <Button variant="quiet" disabled={mark.isPending} onClick={() => mark.mutate(notice.id)}>Mark as read</Button> : null}
    <p className="text-caption text-text-muted">Marking a notice read does not acknowledge its announcement or alert.</p>
    <MutationFeedback pending={mark.isPending} saved={mark.isSuccess} error={mark.error} operation="Marking notice read" success="Notice marked read." />
    <ButtonLink href="/notifications" variant="quiet">Back to notifications</ButtonLink>
  </Card>;
}
