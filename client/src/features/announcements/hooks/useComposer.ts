import { useState } from 'react';
import { CreateAnnouncementRequest, type MeResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useStations } from '@/features/stations';
import { useSendAnnouncement } from '@/features/announcements';
import {
  COMPOSER_ERROR_FIELDS,
  EMPTY_COMPOSER,
  toAnnouncementRequest,
} from '../model/composerRequest';
export function useComposer(me: MeResponse | undefined) {
  const form = useZodForm(CreateAnnouncementRequest, EMPTY_COMPOSER, COMPOSER_ERROR_FIELDS);
  const setBody = form.setter('body');
  const [error, setError] = useState<string | null>(null);
  const stations = useStations();
  const canSendEventWide = me?.capabilities.includes('announcement.event.send') ?? false;

  const send = useSendAnnouncement({
    onSuccess: () => {
      setBody('');
      setError(null);
    },
    onError: () => setError('Could not send. Check your connection and try again.'),
  });

  function submit(): void {
    const ownStationId = me?.currentAssignment?.station.id ?? null;
    const parsed = form.validate(toAnnouncementRequest(form.values, ownStationId));
    if (parsed) send.mutate(parsed);
  }
  return {
    ...form.values,
    submit,
    errors: form.errors,
    setBody,
    setPriority: form.setter('priority'),
    setRequiresAck: form.setter('requiresAck'),
    setEventWide: form.setter('eventWide'),
    setStationId: form.setter('stationId'),
    error,
    stations,
    canSendEventWide,
    send,
  };
}
