import { useRef, useState } from 'react';
import {
  CreateAnnouncementRequest,
  type AnnouncementDraftRecord,
  type MeResponse,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useStations } from '@/features/stations';
import { useAllows } from '@/features/session';
import { saveAnnouncementDraft, replaceAnnouncementDraft } from '../api';
import { usePrivateAnnouncementMutation } from '../queries';
import { initialDraftValues, draftContentRequest } from '../model/draftForm';
import { createRetryIntent } from '../model/retryIntent';
import { announcementFormError } from '../model/scheduleForm';

export function useDraftEditor(input: {
  draft?: AnnouncementDraftRecord | undefined;
  me: MeResponse;
  onSaved: (draft: AnnouncementDraftRecord) => void;
}) {
  const allows = useAllows();
  const form = useZodForm(
    CreateAnnouncementRequest,
    initialDraftValues(input.draft, input.me.event.timezone),
    { target: 'stationId', expiresAt: 'expiresWallTime' },
  );
  const stations = useStations();
  const { save, error, setError } = useDraftSave(input);
  function submit() {
    if (input.me.event.status === 'ARCHIVED' || input.draft?.publishedAt) return;
    setError(null);
    try {
      const request = form.validate(
        draftContentRequest({
          values: form.values,
          draft: input.draft,
          timezone: input.me.event.timezone,
          ownStationId: input.me.currentAssignment?.station.id ?? null,
        }),
      );
      if (request) save.mutate(request);
    } catch {
      setError('Choose a valid expiry date and time.');
    }
  }
  return {
    ...form.values,
    errors: form.errors,
    error,
    save,
    submit,
    stations,
    canSendEventWide: allows('Announcement.SendEvent'),
    ...draftSetters(form.setter),
  };
}

function useDraftSave(input: {
  draft?: AnnouncementDraftRecord | undefined;
  onSaved: (draft: AnnouncementDraftRecord) => void;
}) {
  const eventId = useEventId();
  const intent = useRef(createRetryIntent());
  const [error, setError] = useState<string | null>(null);
  const save = usePrivateAnnouncementMutation({
    draftIdOf: (draft?: AnnouncementDraftRecord) => draft?.id ?? input.draft?.id,
    mutationFn: (request: CreateAnnouncementRequest) =>
      input.draft
        ? replaceAnnouncementDraft(eventId, input.draft.id, {
            ...request,
            expectedVersion: input.draft.version,
          })
        : saveAnnouncementDraft(eventId, {
            ...request,
            idempotencyKey: intent.current.keyFor(request),
          }),
    onSuccess: (draft) => {
      intent.current.clear();
      setError(null);
      input.onSaved(draft);
    },
    onError: (reason) => {
      setError(announcementFormError(reason));
    },
  });
  return { save, error, setError };
}

function draftSetters(
  setter: ReturnType<
    typeof useZodForm<typeof CreateAnnouncementRequest, ReturnType<typeof initialDraftValues>>
  >['setter'],
) {
  return {
    setBody: setter('body'),
    setPriority: setter('priority'),
    setRequiresAck: setter('requiresAck'),
    setEventWide: setter('eventWide'),
    setStationId: setter('stationId'),
    setExpiresWallTime: setter('expiresWallTime'),
  };
}
