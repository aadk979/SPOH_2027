'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { NotificationCentreScreen } from '@/features/notification';
import { LoadingRows } from '@/shared/ui';

function NotificationRoute() {
  const params = useSearchParams();
  return <NotificationCentreScreen {...(params.get('notice') ? { noticeId: params.get('notice')! } : {})} />;
}
export default function NotificationsPage() {
  return <Suspense fallback={<LoadingRows label="Loading notifications" />}><NotificationRoute /></Suspense>;
}
