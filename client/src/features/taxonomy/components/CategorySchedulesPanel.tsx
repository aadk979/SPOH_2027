'use client';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentSession, useMe } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { LoadingRows } from '@/shared/ui';
import { useClearCategorySchedules } from '../queries';
import { CategoryScheduleAccessNotice } from './CategoryScheduleAccessNotice';
import { CategorySchedulePanelBody } from './CategorySchedulePanelBody';
import {
  categoryAccessDenied,
  categoryAccessUnavailable,
  categoryClock,
  categorySchedulingIdentity,
} from '../model/access';

const NOOP = () => {};
export function CategorySchedulesPanel({
  enabled,
  onLockChange = NOOP,
}: {
  enabled: boolean;
  onLockChange?: (locked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const me = useMe();
  const session = useCurrentSession();
  const personId = session?.volunteerId;
  const eventId = useEventId();
  const clear = useClearCategorySchedules();
  const authorised = enabled && categorySchedulingIdentity(me.data, personId, eventId);
  const accessLost = denied || categoryAccessDenied(me.error);
  const timezone = categoryClock(me.data);
  const unavailable = categoryAccessUnavailable({ authorised, accessLost, timezone });
  const lock = useCallback(
    (next: boolean) => {
      setLocked(next);
      onLockChange(next);
    },
    [onLockChange],
  );
  const loseAccess = useCallback(() => setDenied(true), []);
  useEffect(
    () => () => {
      clear();
      onLockChange(false);
    },
    [clear, onLockChange],
  );
  useEffect(() => {
    if (unavailable || !open) {
      clear();
      onLockChange(false);
    }
  }, [unavailable, open, clear, onLockChange]);
  if (!enabled) return null;
  if (!me.data && !me.isError) return <LoadingRows label="Loading category scheduling access" />;
  if (unavailable) return <CategoryScheduleAccessNotice />;
  // Retaining this matched owner keeps an uncertain write's retry intent through a /me outage.
  return (
    <CategorySchedulePanelBody
      ownerKey={`${eventId}:${personId}`}
      open={open}
      locked={locked}
      available={!me.isError}
      timezone={timezone}
      onToggle={() => setOpen(!open)}
      onLockChange={lock}
      onDenied={loseAccess}
    />
  );
}
