'use client';
import { useMemo } from 'react';
import { formatDateTime, formatTime, type EventClockFormat } from '@/shared/lib/format';
import { useMe } from './queries';

export interface EventTimeFormat {
  /** 14:05 on the event's clock. */
  time: (iso: string | null | undefined) => string;
  /** 7 Jan, 14:05 on the event's clock. */
  dateTime: (iso: string | null | undefined) => string;
}

/**
 * Time formatters bound to the event's timezone and locale, from `/me`
 * (ADR-003 §6): never the device's zone and never a constant. Until `/me`
 * has loaded they show a dash rather than a guess.
 */
export function useEventTime(): EventTimeFormat {
  const { data: me } = useMe();
  // Optional chaining on `event` too: an API one release behind (client and
  // API deploy separately, ADR-008 §1 as amended) answers without it.
  const timeZone = me?.event?.timezone;
  const locale = me?.event?.locale;

  return useMemo(() => {
    const clock: EventClockFormat | null = timeZone && locale ? { timeZone, locale } : null;
    return {
      time: (iso) => formatTime(iso, clock),
      dateTime: (iso) => formatDateTime(iso, clock),
    };
  }, [timeZone, locale]);
}
