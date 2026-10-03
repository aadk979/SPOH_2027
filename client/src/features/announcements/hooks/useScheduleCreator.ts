import { useRef, useState } from 'react';
import { ScheduleAnnouncementDraftRequest, type AnnouncementDraftRecord } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { createAnnouncementSchedule } from '../api';
import { usePrivateAnnouncementMutation } from '../queries';
import { createRetryIntent } from '../model/retryIntent';
import {
  announcementFormError,
  publicationInstant,
  publicationWallTime,
} from '../model/scheduleForm';

export function useScheduleCreator(draft: AnnouncementDraftRecord, timezone: string) {
  const eventId = useEventId();
  const intent = useRef(createRetryIntent());
  const [wallTime, setWallTime] = useState(() =>
    publicationWallTime(new Date(Date.now() + 300_000).toISOString(), timezone),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const create = usePrivateAnnouncementMutation({
    draftIdOf: () => draft.id,
    mutationFn: (request: ScheduleAnnouncementDraftRequest) =>
      createAnnouncementSchedule(eventId, draft.id, request),
    onSuccess: () => {
      intent.current.clear();
      setSaved(true);
      setError(null);
    },
    onError: (reason) => {
      setError(announcementFormError(reason));
    },
  });
  function submit() {
    setError(null);
    setSaved(false);
    try {
      const input = {
        expectedVersion: draft.version,
        runAt: publicationInstant(wallTime, timezone),
      };
      if (Date.parse(input.runAt) <= Date.now()) {
        setError('Choose a future publication time.');
        return;
      }
      create.mutate(
        ScheduleAnnouncementDraftRequest.parse({
          ...input,
          idempotencyKey: intent.current.keyFor(input),
        }),
      );
    } catch {
      setError('Choose a valid publication date and time.');
    }
  }
  return { wallTime, setWallTime, error, saved, create, submit };
}
