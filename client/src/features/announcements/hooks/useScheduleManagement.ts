import { useState } from 'react';
import type {
  AnnouncementDraftRecord,
  AnnouncementPublicationScheduleRecord,
  UpdateAnnouncementPublicationScheduleRequest,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { changeAnnouncementSchedule, cancelAnnouncementSchedule } from '../api';
import { usePrivateAnnouncementMutation } from '../queries';
import {
  announcementFormError,
  publicationInstant,
  publicationWallTime,
} from '../model/scheduleForm';

type ScheduleInput = {
  draft: AnnouncementDraftRecord;
  schedule: AnnouncementPublicationScheduleRecord;
  timezone: string;
};
export function useScheduleManagement(input: ScheduleInput) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [wallTime, setWallTime] = useState(() =>
    publicationWallTime(input.schedule.runAt, input.timezone),
  );
  const onSuccess = () => {
    setError(null);
    setEditing(false);
  };
  const onError = (reason: unknown) => {
    setError(announcementFormError(reason));
  };
  const callbacks = { onSuccess, onError, draftIdOf: () => input.draft.id };
  const { update, cancel } = useScheduleMutations(input, callbacks);
  function submit() {
    setError(null);
    try {
      const originalWallTime = publicationWallTime(input.schedule.runAt, input.timezone);
      const runAt =
        wallTime === originalWallTime
          ? input.schedule.runAt
          : publicationInstant(wallTime, input.timezone);
      update.mutate({
        expectedVersion: input.schedule.version,
        expectedDraftVersion: input.draft.version,
        runAt,
      });
    } catch {
      setError('Choose a valid publication date and time.');
    }
  }
  return {
    error,
    editing,
    setEditing,
    wallTime,
    setWallTime,
    update,
    cancel,
    submit,
    busy: update.isPending || cancel.isPending,
  };
}

function useScheduleMutations(
  input: ScheduleInput,
  callbacks: {
    onSuccess: () => void;
    onError: (reason: unknown) => void;
    draftIdOf: () => string;
  },
) {
  const eventId = useEventId();
  const update = usePrivateAnnouncementMutation({
    ...callbacks,
    mutationFn: (request: UpdateAnnouncementPublicationScheduleRequest) =>
      changeAnnouncementSchedule(eventId, {
        id: input.draft.id,
        scheduleId: input.schedule.id,
        request,
      }),
  });
  const cancel = usePrivateAnnouncementMutation({
    ...callbacks,
    mutationFn: () =>
      cancelAnnouncementSchedule(eventId, {
        id: input.draft.id,
        scheduleId: input.schedule.id,
        request: { expectedVersion: input.schedule.version },
      }),
  });
  return { update, cancel };
}
