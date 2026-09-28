import { useState } from 'react';
import { useStations } from '@/features/stations';
import type { MeResponse } from '@spoh/shared';
import { useSendAnnouncement } from '@/features/announcements';
import type { Priority } from '../model/priority';
export function useComposer(me: MeResponse | undefined) {
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('OPERATIONAL');
  const [requiresAck, setRequiresAck] = useState(false);
  const [eventWide, setEventWide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stations = useStations();

  const [stationId, setStationId] = useState<string>('');
  const canSendEventWide = me?.capabilities.includes('announcement.event.send') ?? false;

  const send = useSendAnnouncement(
    () => ({
      body: body.trim(),
      priority,
      requiresAck,
      target: eventWide
        ? {}
        : { stationId: stationId || me?.currentAssignment?.station.id || null },
    }),
    {
      onSuccess: () => {
        setBody('');
        setError(null);
      },
      onError: () => setError('Could not send. Check your connection and try again.'),
    },
  );

  return {
    body,
    setBody,
    priority,
    setPriority,
    requiresAck,
    setRequiresAck,
    eventWide,
    setEventWide,
    error,
    stations,
    stationId,
    setStationId,
    canSendEventWide,
    send,
  };
}
